import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { getNextWeek, getPreviousWeek, getWeekBounds, getTodayKolkataISO } from '../lib/dateUtils';

interface WeekNavigatorProps {
  currentWeekStart: string;
  onWeekChange: (newWeekStart: string) => void;
}

export function WeekNavigator({ currentWeekStart, onWeekChange }: WeekNavigatorProps) {
  const bounds = getWeekBounds(currentWeekStart);
  const todayISO = getTodayKolkataISO();
  const currentWeekBounds = getWeekBounds(todayISO);
  const isCurrentWeek = bounds.startDate === currentWeekBounds.startDate;

  const handlePrev = () => {
    const prev = getPreviousWeek(bounds.startDate);
    onWeekChange(prev.startDate);
  };

  const handleNext = () => {
    const next = getNextWeek(bounds.startDate);
    onWeekChange(next.startDate);
  };

  const handleCurrentWeek = () => {
    onWeekChange(currentWeekBounds.startDate);
  };

  const handleDatePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const picked = getWeekBounds(e.target.value);
      onWeekChange(picked.startDate);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border border-[#696969]/20 rounded-lg p-1.5 shadow-xs">
      <div className="flex items-center space-x-1">
        <button
          onClick={handlePrev}
          title="Previous reporting week (Saturday - Friday)"
          className="p-1.5 text-[#696969] hover:text-[#014025] hover:bg-[#696969]/10 rounded-md transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2 px-2.5 py-1 bg-[#696969]/5 border border-[#696969]/20 rounded-md">
          <Calendar className="w-4 h-4 text-[#696969]" />
          <span className="text-xs font-semibold text-[#014025] tracking-tight font-mono">
            {bounds.displayRange}
          </span>
          <span className="text-white bg-[#014025] px-1.5 py-0.5 rounded uppercase font-bold text-[10px]">
            Sat–Fri
          </span>
        </div>

        <button
          onClick={handleNext}
          title="Next reporting week (Saturday - Friday)"
          className="p-1.5 text-[#696969] hover:text-[#014025] hover:bg-[#696969]/10 rounded-md transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center space-x-2">
        {!isCurrentWeek && (
          <button
            onClick={handleCurrentWeek}
            className="text-[#014025] bg-[#014025]/10 hover:bg-[#014025]/20 rounded-md font-medium text-xs px-2 py-1 transition-colors"
          >
            Current Week
          </button>
        )}

        <div className="relative">
          <input
            type="date"
            onChange={handleDatePick}
            className="border border-[#696969]/20 rounded-md px-2 py-1 text-xs bg-white text-[#696969] focus:outline-none focus:ring-1 focus:ring-[#456B5A]"
            title="Pick date to jump to corresponding Saturday–Friday week"
          />
        </div>
      </div>
    </div>
  );
}
