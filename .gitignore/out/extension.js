"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const utils_1 = require("./webview/utils");
function activate(context) {
    let workMinutes = context.globalState.get('workMinutes') || 25;
    let shortBreakMinutes = context.globalState.get('shortBreakMinutes') || 5;
    let longBreakMinutes = context.globalState.get('longBreakMinutes') || 15;
    let cyclesBeforeLongBreak = context.globalState.get('cyclesBeforeLongBreak') || 4;
    let totalWorkMinutesAll = context.globalState.get('totalWorkMinutesAll') || 0;
    let totalBreakMinutesAll = context.globalState.get('totalBreakMinutesAll') || 0;
    let totalSessionsAll = context.globalState.get('totalSessionsAll') || 0;
    const todayKey = new Date().toISOString().split('T')[0];
    let dailyStats = context.globalState.get('dailyStats') || {};
    if (!dailyStats[todayKey]) {
        dailyStats[todayKey] = { work: 0, break: 0, sessions: 0 };
    }
    let currentCycle = 0;
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('pomodoro-view', {
        resolveWebviewView(webviewView) {
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
            let interval = null;
            let showSettings = false;
            function readFile(uri) {
                const filePath = uri.fsPath;
                return fs.readFileSync(filePath, 'utf8');
            }
            function getMediaUri(relativePath) {
                return webviewView.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, relativePath));
            }
            function renderTemplate(templatePath, data) {
                let template = readFile(vscode.Uri.joinPath(context.extensionUri, templatePath));
                for (const [key, value] of Object.entries(data)) {
                    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
                }
                return template;
            }
            function loadCSS(cssPath) {
                const css = readFile(vscode.Uri.joinPath(context.extensionUri, cssPath));
                return `<style>${css}</style>`;
            }
            function updateView() {
                const modeColor = isWorkMode ? '#4CAF50' : (isLongBreak ? '#9C27B0' : '#2196F3');
                const modeText = isWorkMode ? 'Работа' : (isLongBreak ? 'Длинный отдых' : 'Отдых');
                const progress = (0, utils_1.getProgressPercent)(totalSeconds, isWorkMode, workMinutes, shortBreakMinutes, longBreakMinutes, isLongBreak);
                const today = dailyStats[todayKey] || { work: 0, break: 0, sessions: 0 };
                if (showSettings) {
                    const settingsHtml = renderTemplate('src/webview/templates/settings.html', {
                        WORK_MINUTES: workMinutes,
                        SHORT_BREAK_MINUTES: shortBreakMinutes,
                        LONG_BREAK_MINUTES: longBreakMinutes,
                        CYCLES_BEFORE_LONG_BREAK: cyclesBeforeLongBreak
                    });
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
                }
                else {
                    // 🟢 Таймер рендерим только один раз — без постоянных перерисовок
                    const timerHtml = renderTemplate('src/webview/templates/timer.html', {
                        MODE_TEXT: modeText,
                        MODE_COLOR: modeColor,
                        TIMER_DISPLAY: (0, utils_1.formatTime)(totalSeconds),
                        START_BUTTON_TEXT: interval ? '⏸PAUSE' : '⏵︎START',
                        TODAY_WORK: today.work,
                        TODAY_BREAK: today.break,
                        TODAY_SESSIONS: today.sessions,
                        TOTAL_WORK: totalWorkMinutesAll,
                        TOTAL_BREAK: totalBreakMinutesAll,
                        TOTAL_SESSIONS: totalSessionsAll
                    });
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
                if (interval)
                    return;
                interval = setInterval(() => {
                    if (totalSeconds > 0) {
                        totalSeconds--;
                        // 🟢 Только отправляем сообщение о новом времени — не перерисовываем HTML
                        webviewView.webview.postMessage({
                            command: 'updateTimer',
                            time: (0, utils_1.formatTime)(totalSeconds),
                            startButtonText: interval ? '⏸PAUSE' : '⏵︎START',
                        });
                    }
                    else {
                        clearInterval(interval);
                        interval = null;
                        // ⬇ остальная логика как у тебя — не меняется
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
                            vscode.window.showInformationMessage(isLongBreak ? `Длинный перерыв (${breakMinutes} мин)!` : `Короткий перерыв (${breakMinutes} мин)!`, 'Принять', 'Отклонить').then(selection => {
                                if (selection === 'Принять') {
                                    isWorkMode = false;
                                    totalSeconds = breakMinutes * 60;
                                    startTimer();
                                }
                                else if (selection === 'Отклонить') {
                                    isWorkMode = true;
                                    totalSeconds = workMinutes * 60;
                                    startTimer();
                                }
                            });
                        }
                        else {
                            const breakMinutes = isLongBreak ? longBreakMinutes : shortBreakMinutes;
                            dailyStats[todayKey].break += breakMinutes;
                            totalBreakMinutesAll += breakMinutes;
                            context.globalState.update('dailyStats', dailyStats);
                            context.globalState.update('totalBreakMinutesAll', totalBreakMinutesAll);
                            vscode.window.showInformationMessage(isLongBreak ? 'Длинный отдых окончен! Вернуться к работе?' : 'Перерыв окончен! Вернуться к работе?', 'Принять', 'Отклонить').then(selection => {
                                if (selection === 'Принять') {
                                    isWorkMode = true;
                                    isLongBreak = false;
                                    totalSeconds = workMinutes * 60;
                                    startTimer();
                                }
                                else if (selection === 'Отклонить') {
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
                    }
                    else {
                        startTimer();
                    }
                    updateView();
                }
                else if (message.command === 'reset') {
                    if (interval)
                        clearInterval(interval);
                    interval = null;
                    isWorkMode = true;
                    isLongBreak = false;
                    totalSeconds = workMinutes * 60;
                    currentCycle = 0;
                    updateView();
                }
                else if (message.command === 'showSettings') {
                    showSettings = true;
                    updateView();
                }
                else if (message.command === 'showTimer') {
                    showSettings = false;
                    updateView();
                }
                else if (message.command === 'saveSettings') {
                    workMinutes = message.work;
                    shortBreakMinutes = message.short;
                    longBreakMinutes = message.long;
                    cyclesBeforeLongBreak = message.cycles;
                    await context.globalState.update('workMinutes', workMinutes);
                    await context.globalState.update('shortBreakMinutes', shortBreakMinutes);
                    await context.globalState.update('longBreakMinutes', longBreakMinutes);
                    await context.globalState.update('cyclesBeforeLongBreak', cyclesBeforeLongBreak);
                    if (interval)
                        clearInterval(interval);
                    interval = null;
                    isWorkMode = true;
                    isLongBreak = false;
                    totalSeconds = workMinutes * 60;
                    currentCycle = 0;
                    showSettings = false;
                    updateView();
                }
                else if (message.command === 'clearToday') {
                    vscode.window.showInformationMessage('Вы точно хотите удалить все данные за день?', 'Принять', 'Отклонить').then(selection => {
                        if (selection === 'Принять') {
                            dailyStats[todayKey] = { work: 0, break: 0, sessions: 0 };
                            context.globalState.update('dailyStats', dailyStats);
                        }
                        else if (selection === 'Отклонить') {
                            context.globalState.update('dailyStats', dailyStats);
                        }
                    });
                    updateView();
                }
                else if (message.command === 'clearAll') {
                    vscode.window.showInformationMessage('Вы точно хотите удалить все данные за все время?', 'Принять', 'Отклонить').then(selection => {
                        if (selection === 'Принять') {
                            dailyStats = { [todayKey]: { work: 0, break: 0, sessions: 0 } };
                            totalWorkMinutesAll = 0;
                            totalBreakMinutesAll = 0;
                            totalSessionsAll = 0;
                            context.globalState.update('dailyStats', dailyStats);
                            context.globalState.update('totalWorkMinutesAll', 0);
                            context.globalState.update('totalBreakMinutesAll', 0);
                            context.globalState.update('totalSessionsAll', 0);
                        }
                        else if (selection === 'Отклонить') {
                            context.globalState.update('dailyStats', dailyStats);
                        }
                    });
                    updateView();
                }
            });
            updateView();
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map