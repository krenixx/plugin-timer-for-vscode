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
exports.PomodoroViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class PomodoroViewProvider {
    context;
    _view;
    // Настройки
    workMinutes;
    shortBreakMinutes;
    longBreakMinutes;
    cyclesBeforeLongBreak;
    // Статистика
    totalWorkMinutesAll;
    totalBreakMinutesAll;
    totalSessionsAll;
    dailyStats;
    currentCycle = 0;
    constructor(context) {
        this.context = context;
        this.workMinutes = context.globalState.get('workMinutes') || 25;
        this.shortBreakMinutes = context.globalState.get('shortBreakMinutes') || 5;
        this.longBreakMinutes = context.globalState.get('longBreakMinutes') || 15;
        this.cyclesBeforeLongBreak = context.globalState.get('cyclesBeforeLongBreak') || 4;
        this.totalWorkMinutesAll = context.globalState.get('totalWorkMinutesAll') || 0;
        this.totalBreakMinutesAll = context.globalState.get('totalBreakMinutesAll') || 0;
        this.totalSessionsAll = context.globalState.get('totalSessionsAll') || 0;
        this.dailyStats = context.globalState.get('dailyStats') || {};
    }
    resolveWebviewView(view) {
        this._view = view;
        view.webview.options = { enableScripts: true };
        this.updateView(false);
        view.webview.onDidReceiveMessage(async (message) => {
            const todayKey = new Date().toISOString().split('T')[0];
            if (!this.dailyStats[todayKey])
                this.dailyStats[todayKey] = { work: 0, break: 0, sessions: 0 };
            switch (message.command) {
                case 'showSettings':
                    this.updateView(true);
                    break;
                case 'showTimer':
                    this.updateView(false);
                    break;
                case 'saveSettings':
                    this.workMinutes = message.work;
                    this.shortBreakMinutes = message.short;
                    this.longBreakMinutes = message.long;
                    this.cyclesBeforeLongBreak = message.cycles;
                    await this.context.globalState.update('workMinutes', this.workMinutes);
                    await this.context.globalState.update('shortBreakMinutes', this.shortBreakMinutes);
                    await this.context.globalState.update('longBreakMinutes', this.longBreakMinutes);
                    await this.context.globalState.update('cyclesBeforeLongBreak', this.cyclesBeforeLongBreak);
                    this.updateView(false);
                    break;
                case 'clearToday':
                    this.dailyStats[todayKey] = { work: 0, break: 0, sessions: 0 };
                    await this.context.globalState.update('dailyStats', this.dailyStats);
                    this.updateView(false);
                    break;
                case 'clearAll':
                    this.dailyStats = { [todayKey]: { work: 0, break: 0, sessions: 0 } };
                    this.totalWorkMinutesAll = 0;
                    this.totalBreakMinutesAll = 0;
                    this.totalSessionsAll = 0;
                    await this.context.globalState.update('dailyStats', this.dailyStats);
                    await this.context.globalState.update('totalWorkMinutesAll', 0);
                    await this.context.globalState.update('totalBreakMinutesAll', 0);
                    await this.context.globalState.update('totalSessionsAll', 0);
                    this.updateView(false);
                    break;
            }
        });
    }
    getHtmlTemplate(file) {
        const filePath = path.join(this.context.extensionPath, 'src', 'webview', 'templates', file);
        return fs.readFileSync(filePath, 'utf8');
    }
    updateView(showSettings) {
        if (!this._view)
            return;
        const templateFile = showSettings ? 'settings.html' : 'timer.html';
        let html = this.getHtmlTemplate(templateFile);
        const styleFile = showSettings ? 'settings.css' : 'timer.css';
        const stylePath = vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview', 'styles', styleFile));
        const styleUri = this._view.webview.asWebviewUri(stylePath);
        html = html.replace(/\{\{styleUri\}\}/g, styleUri.toString());
        const todayKey = new Date().toISOString().split('T')[0];
        if (!this.dailyStats[todayKey])
            this.dailyStats[todayKey] = { work: 0, break: 0, sessions: 0 };
        if (showSettings) {
            html = html.replace(/\{\{workMinutes\}\}/g, this.workMinutes.toString());
            html = html.replace(/\{\{shortBreakMinutes\}\}/g, this.shortBreakMinutes.toString());
            html = html.replace(/\{\{longBreakMinutes\}\}/g, this.longBreakMinutes.toString());
            html = html.replace(/\{\{cyclesBeforeLongBreak\}\}/g, this.cyclesBeforeLongBreak.toString());
        }
        else {
            html = html.replace(/\{\{todayWork\}\}/g, this.dailyStats[todayKey].work.toString());
            html = html.replace(/\{\{todayBreak\}\}/g, this.dailyStats[todayKey].break.toString());
            html = html.replace(/\{\{todaySessions\}\}/g, this.dailyStats[todayKey].sessions.toString());
            html = html.replace(/\{\{allWork\}\}/g, this.totalWorkMinutesAll.toString());
            html = html.replace(/\{\{allBreak\}\}/g, this.totalBreakMinutesAll.toString());
            html = html.replace(/\{\{allSessions\}\}/g, this.totalSessionsAll.toString());
        }
        this._view.webview.html = html;
    }
}
exports.PomodoroViewProvider = PomodoroViewProvider;
//# sourceMappingURL=pomodoroView.js.map