/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./popup/**/*.{html,js}",
    "./lock/**/*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        black: '#000000',
        white: '#ffffff',
        gray: {
          900: '#111111',
          800: '#222222',
          700: '#333333',
          600: '#444444',
          500: '#555555',
          400: '#666666',
          300: '#888888',
          200: '#aaaaaa',
          100: '#cccccc',
          50: '#eeeeee',
        }
      }
    },
  },
  plugins: [],
}
