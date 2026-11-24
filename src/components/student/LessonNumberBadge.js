import React from 'react';

const NumberText = ({ value, fill }) => {
  const text = String(value);
  return (
    <text
      x="32"
      y="45"
      textAnchor="middle"
      dominantBaseline="central"
      fill={fill}
      fontSize={text.length >= 2 ? 16 : 22}
      fontWeight="700"
      fontFamily='"BIZ UDPGothic", "Yu Gothic UI", sans-serif'
    >
      {text}
    </text>
  );
};

const LightEarned = () => (
  <>
    <circle cx="32" cy="10" r="5" fill="none" stroke="#1D4ED8" strokeWidth="2.5" />
    <path d="M28.8 14.2h6.4l-1.2 10h-4z" fill="#1D4ED8" />
    <circle cx="32" cy="42" r="23" fill="#DBEAFE" />
    <circle cx="32" cy="42" r="19.5" fill="#1D4ED8" />
    <circle cx="32" cy="42" r="15.5" fill="none" stroke="#EFF6FF" strokeWidth="1.5" />
    <ellipse cx="32" cy="34" rx="9" ry="4.5" fill="#60A5FA" opacity="0.55" />
  </>
);

const LightIdle = () => (
  <>
    <circle cx="32" cy="42" r="19.5" fill="#F4F4F5" stroke="#D4D4D8" strokeWidth="2" />
    <circle cx="32" cy="42" r="15.5" fill="none" stroke="#E4E4E7" strokeWidth="1.25" />
  </>
);

const DarkEarned = () => (
  <>
    <circle cx="32" cy="10" r="5" fill="none" stroke="#7DD3FC" strokeWidth="2.5" />
    <path d="M28.8 14.2h6.4l-1.2 10h-4z" fill="#7DD3FC" />
    <circle cx="32" cy="42" r="23" fill="#38BDF8" opacity="0.28" />
    <circle cx="32" cy="42" r="19.5" fill="#F8FAFC" />
    <circle cx="32" cy="42" r="15.5" fill="none" stroke="#38BDF8" strokeWidth="1.75" />
    <ellipse cx="32" cy="34" rx="9" ry="4.5" fill="#FFFFFF" opacity="0.7" />
  </>
);

const DarkIdle = () => (
  <>
    <circle cx="32" cy="42" r="19.5" fill="#171717" stroke="#52525B" strokeWidth="2" />
    <circle cx="32" cy="42" r="15.5" fill="none" stroke="#3F3F46" strokeWidth="1.25" />
  </>
);

const LessonNumberBadge = ({ number, earned, label, onClick }) => (
  <button
    type="button"
    className={`lesson-number-badge ${earned ? 'is-earned' : 'is-idle'}`}
    disabled={!earned}
    onClick={earned ? onClick : undefined}
    aria-label={label}
    title={label}
  >
    <svg className="badge-light" viewBox="0 0 64 72" aria-hidden="true">
      {earned ? <LightEarned /> : <LightIdle />}
      <NumberText value={number} fill={earned ? '#FFFFFF' : '#A1A1AA'} />
    </svg>
    <svg className="badge-dark" viewBox="0 0 64 72" aria-hidden="true">
      {earned ? <DarkEarned /> : <DarkIdle />}
      <NumberText value={number} fill={earned ? '#0F172A' : '#6B7280'} />
    </svg>
  </button>
);

export default LessonNumberBadge;
