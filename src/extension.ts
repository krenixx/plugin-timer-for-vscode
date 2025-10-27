import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { formatTime, getProgressPercent} from './webview/utils';

export function activate(context: vscode.ExtensionContext) {

  let workMinutes = context.globalState.get<number>('workMinutes') || 25;
  let shortBreakMinutes = context.globalState.get<number>('shortBreakMinutes') || 5;
  let longBreakMinutes = context.globalState.get<number>('longBreakMinutes') || 15;
  let cyclesBeforeLongBreak = context.globalState.get<number>('cyclesBeforeLongBreak') || 4;

  let totalWorkMinutesAll = context.globalState.get<number>('totalWorkMinutesAll') || 0;
  let totalBreakMinutesAll = context.globalState.get<number>('totalBreakMinutesAll') || 0;
  let totalSessionsAll = context.globalState.get<number>('totalSessionsAll') || 0;

  const todayKey = new Date().toISOString().split('T')[0];
  let dailyStats = context.globalState.get<Record<string, { work: number; break: number; sessions: number }>>('dailyStats') || {};
  if (!dailyStats[todayKey]) {
    dailyStats[todayKey] = { work: 0, break: 0, sessions: 0 };
  }

  let currentCycle = 0;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('pomodoro-view', {
      resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'src', 'webview'),
            vscode.Uri.joinPath(context.extensionUri, 'media')
          ]
        };

        let totalSeconds = workMinutes * 60;
        let isWorkMode = true;
        let isLongBreak = false;
        let interval: NodeJS.Timeout | null = null;
        let showSettings = false;

        function readFile(uri: vscode.Uri): string {
          const filePath = uri.fsPath;
          return fs.readFileSync(filePath, 'utf8');
        }

        function getMediaUri(relativePath: string): vscode.Uri {
          return webviewView.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, relativePath));
        }

        function renderTemplate(templatePath: string, data: Record<string, any>): string {
          let template = readFile(vscode.Uri.joinPath(context.extensionUri, templatePath));
          
          for (const [key, value] of Object.entries(data)) {
            template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
          }
          
          return template;
        }

        function loadCSS(cssPath: string): string {
          const css = readFile(vscode.Uri.joinPath(context.extensionUri, cssPath));
          return `<style>${css}</style>`;
        }

        function updateView() {
          const modeColor = isWorkMode ? '#4CAF50' : (isLongBreak ? '#9C27B0' : '#2196F3');
          const modeText = isWorkMode ? 'Работа' : (isLongBreak ? 'Длинный отдых' : 'Отдых');
          const progress = getProgressPercent(totalSeconds, isWorkMode, workMinutes, shortBreakMinutes, longBreakMinutes, isLongBreak);
          const today = dailyStats[todayKey] || { work: 0, break: 0, sessions: 0 };

          if (showSettings) {
            const settingsHtml = renderTemplate(
              'src/webview/templates/settings.html',
              {
                WORK_MINUTES: workMinutes,
                SHORT_BREAK_MINUTES: shortBreakMinutes,
                LONG_BREAK_MINUTES: longBreakMinutes,
                CYCLES_BEFORE_LONG_BREAK: cyclesBeforeLongBreak
              }
            );

            const css = loadCSS('src/webview/styles/settings.css');

            webviewView.webview.html = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                ${css}
              </head>
              <body>
                ${settingsHtml}
              </body>
              </html>
            `;
          } else {
            const timerHtml = renderTemplate(
              'src/webview/templates/timer.html',
              {
                MODE_TEXT: modeText,
                MODE_COLOR: modeColor,
                TIMER_DISPLAY: formatTime(totalSeconds),
                START_BUTTON_TEXT: interval ? '⏸PAUSE' : '⏵︎START',
                TODAY_WORK: today.work,
                TODAY_BREAK: today.break,
                TODAY_SESSIONS: today.sessions,
                TOTAL_WORK: totalWorkMinutesAll,
                TOTAL_BREAK: totalBreakMinutesAll,
                TOTAL_SESSIONS: totalSessionsAll
              }
            );

            const css = loadCSS('src/webview/styles/timer.css');

            webviewView.webview.html = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                ${css}
              </head>
              <body>
                ${timerHtml}
                <script>
                  const vscode = acquireVsCodeApi();

                  document.getElementById('startBtn').onclick = () => vscode.postMessage({ command: 'toggle' });
                  document.getElementById('resetBtn').onclick = () => vscode.postMessage({ command: 'reset' });
                  document.getElementById('settingsBtn').onclick = () => vscode.postMessage({ command: 'showSettings' });

                  // 🟢 получаем обновления времени без полной перерисовки
                  window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateTimer') {
                      const timerEl = document.querySelector('.timer');
                      timerEl.textContent = message.time;
                      document.getElementById('startBtn').textContent = message.startButtonText;
                    }
                  });
                </script>
              </body>
              </html>
            `;
          }
        }


        function startTimer() {
          if (interval) return;

          interval = setInterval(() => {
            if (totalSeconds > 0) {
              totalSeconds--;
              webviewView.webview.postMessage({
                command: 'updateTimer',
                time: formatTime(totalSeconds),
                startButtonText: interval ? '⏸PAUSE' : '⏵︎START',
              });

            } else {
              clearInterval(interval!);
              interval = null;
              if (isWorkMode) {
                dailyStats[todayKey].work += workMinutes;
                dailyStats[todayKey].sessions += 1;
                totalWorkMinutesAll += workMinutes;
                totalSessionsAll += 1;
                context.globalState.update('dailyStats', dailyStats);
                context.globalState.update('totalWorkMinutesAll', totalWorkMinutesAll);
                context.globalState.update('totalSessionsAll', totalSessionsAll);

                currentCycle++;
                isLongBreak = (currentCycle % cyclesBeforeLongBreak === 0);
                const breakMinutes = isLongBreak ? longBreakMinutes : shortBreakMinutes;

                vscode.window.showInformationMessage(
                  isLongBreak ? `Длинный перерыв (${breakMinutes} мин)!` : `Короткий перерыв (${breakMinutes} мин)!`,
                  'Принять', 'Отклонить'
                ).then(selection => {
                  if (selection === 'Принять') {
                    isWorkMode = false;
                    totalSeconds = breakMinutes * 60;
                    startTimer();
                  } else if (selection === 'Отклонить') {
                    isWorkMode = true;
                    totalSeconds = workMinutes * 60;
                    startTimer();
                  }
                });
              } else {
                const breakMinutes = isLongBreak ? longBreakMinutes : shortBreakMinutes;
                dailyStats[todayKey].break += breakMinutes;
                totalBreakMinutesAll += breakMinutes;
                context.globalState.update('dailyStats', dailyStats);
                context.globalState.update('totalBreakMinutesAll', totalBreakMinutesAll);

                vscode.window.showInformationMessage(
                  isLongBreak ? 'Длинный отдых окончен! Вернуться к работе?' : 'Перерыв окончен! Вернуться к работе?',
                  'Принять', 'Отклонить'
                ).then(selection => {
                  if (selection === 'Принять') {
                    isWorkMode = true;
                    isLongBreak = false;
                    totalSeconds = workMinutes * 60;
                    startTimer();
                  } else if (selection === 'Отклонить') {
                    isWorkMode = false;
                    totalSeconds = breakMinutes * 60;
                    startTimer();
                  }
                });
              }
            }
          }, 1000);
        }


        webviewView.webview.onDidReceiveMessage(async (message) => {
          if (message.command === 'toggle') {
            if (interval) {
              clearInterval(interval);
              interval = null;
            } else {
              startTimer();
            }
            updateView();
          } else if (message.command === 'reset') {
            if (interval) clearInterval(interval);
            interval = null;
            isWorkMode = true;
            isLongBreak = false;
            totalSeconds = workMinutes * 60;
            currentCycle = 0;
            updateView();
          } else if (message.command === 'showSettings') {
            showSettings = true;
            updateView();
          } else if (message.command === 'showTimer') {
            showSettings = false;
            updateView();
          } else if (message.command === 'saveSettings') {
            workMinutes = message.work;
            shortBreakMinutes = message.short;
            longBreakMinutes = message.long;
            cyclesBeforeLongBreak = message.cycles;
            await context.globalState.update('workMinutes', workMinutes);
            await context.globalState.update('shortBreakMinutes', shortBreakMinutes);
            await context.globalState.update('longBreakMinutes', longBreakMinutes);
            await context.globalState.update('cyclesBeforeLongBreak', cyclesBeforeLongBreak);
            if (interval) clearInterval(interval);
            interval = null;
            isWorkMode = true;
            isLongBreak = false;
            totalSeconds = workMinutes * 60;
            currentCycle = 0;
            showSettings = false;
            updateView();
          } else if (message.command === 'clearToday') {
                vscode.window.showInformationMessage(
                  'Вы точно хотите удалить все данные за день?',
                  'Принять', 'Отклонить'
                ).then(selection => {
                  if (selection === 'Принять') {
                    dailyStats[todayKey] = { work: 0, break: 0, sessions: 0 };
                    context.globalState.update('dailyStats', dailyStats);
                  } else if (selection === 'Отклонить') {
                    context.globalState.update('dailyStats', dailyStats);
                  }
                });
            updateView();
          } else if (message.command === 'clearAll') {
                vscode.window.showInformationMessage(
                  'Вы точно хотите удалить все данные за все время?',
                  'Принять', 'Отклонить'
                ).then(selection => {
                  if (selection === 'Принять') {
                    dailyStats = { [todayKey]: { work: 0, break: 0, sessions: 0 } };
                    totalWorkMinutesAll = 0;
                    totalBreakMinutesAll = 0;
                    totalSessionsAll = 0;
                    context.globalState.update('dailyStats', dailyStats);
                    context.globalState.update('totalWorkMinutesAll', 0);
                    context.globalState.update('totalBreakMinutesAll', 0);
                    context.globalState.update('totalSessionsAll', 0);
                  } else if (selection === 'Отклонить') {
                    context.globalState.update('dailyStats', dailyStats);
                  }
                });
            updateView();
          }
        });

        updateView();
      }
    })
  );
}

export function deactivate() {}