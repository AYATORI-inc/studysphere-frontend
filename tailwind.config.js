/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"BIZ UDPGothic"', '"Yu Gothic UI"', '"Hiragino Sans"', 'Meiryo', 'sans-serif'],
      },
    },
  },
  plugins: [],
} 