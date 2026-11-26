import React, { useEffect, useId, useState } from 'react';

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const MINUTE_CHOICES = ['00', '30'];

export const toClockTime = (value) => {
  if (value == null || String(value).trim() === '') return '';
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return '';
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return '';

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const formatMinute = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 2);
  if (!digits) return '00';
  return String(Math.min(Number(digits), 59)).padStart(2, '0');
};

const HalfHourTimeInput = ({ value, onChange, className = '' }) => {
  const listId = useId().replace(/:/g, '');
  const normalized = toClockTime(value);
  const [hour, minute] = normalized ? normalized.split(':') : ['', ''];
  const [minuteDraft, setMinuteDraft] = useState(null);
  const minuteShown = minuteDraft === null ? minute : minuteDraft;
  const fieldClass = `min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 ${className}`;

  useEffect(() => {
    setMinuteDraft(null);
  }, [value]);

  const emit = (nextHour, rawMinute) => {
    if (!nextHour) {
      onChange('');
      return;
    }
    onChange(`${nextHour}:${formatMinute(rawMinute)}`);
  };

  const handleMinuteChange = (rawValue) => {
    const digits = String(rawValue).replace(/\D/g, '').slice(0, 2);
    if (hour && digits.length === 2) {
      const formatted = formatMinute(digits);
      setMinuteDraft(formatted);
      emit(hour, formatted);
      return;
    }
    setMinuteDraft(digits);
  };

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="時"
        value={hour}
        onChange={(event) => emit(event.target.value, minuteShown || '00')}
        className={fieldClass}
      >
        <option value="">--</option>
        {HOURS.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      <span className="text-gray-500" aria-hidden="true">:</span>
      <input
        aria-label="分"
        list={listId}
        inputMode="numeric"
        maxLength={2}
        value={hour ? minuteShown : ''}
        disabled={!hour}
        placeholder={hour ? '分' : '--'}
        onChange={(event) => handleMinuteChange(event.target.value)}
        onBlur={(event) => {
          if (!hour) return;
          emit(hour, event.target.value);
        }}
        className={`${fieldClass} disabled:bg-gray-100`}
      />
      <datalist id={listId}>
        {MINUTE_CHOICES.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </div>
  );
};

export default HalfHourTimeInput;
