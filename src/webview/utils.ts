import * as vscode from 'vscode';
import * as cp from 'child_process';

export function formatTime(secs: number): string {
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
}

export function getProgressPercent(
  totalSeconds: number,
  isWorkMode: boolean,
  workMinutes: number,
  shortBreakMinutes: number,
  longBreakMinutes: number,
  isLongBreak: boolean
): number {
  const initial = isWorkMode 
    ? workMinutes * 60 
    : (isLongBreak ? longBreakMinutes : shortBreakMinutes) * 60;
  return ((initial - totalSeconds) / initial) * 100;
}
