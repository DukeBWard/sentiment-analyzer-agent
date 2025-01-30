/** @type {import('postcss').Config} */
module.exports = {
  plugins: [
    require('@tailwindcss/postcss7-compat'),
    require('autoprefixer'),
  ]
} 