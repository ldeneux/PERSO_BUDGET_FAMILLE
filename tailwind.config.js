/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
    },
  },
  safelist: [
    { pattern: /^(bg|text|border)-(emerald|amber|rose|sky|violet|orange|teal|fuchsia|stone)-(50|200|500|700|800)$/ },
  ],
  plugins: [],
};
