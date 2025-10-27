"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTime = formatTime;
exports.getProgressPercent = getProgressPercent;
function formatTime(secs) {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}
function getProgressPercent(totalSeconds, isWorkMode, workMinutes, shortBreakMinutes, longBreakMinutes, isLongBreak) {
    const initial = isWorkMode
        ? workMinutes * 60
        : (isLongBreak ? longBreakMinutes : shortBreakMinutes) * 60;
    return ((initial - totalSeconds) / initial) * 100;
}
//# sourceMappingURL=utils.js.map