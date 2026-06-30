/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--primary)",
        secondary: "var(--secondary)",
        border: "#dde4ef",
        muted: "#f7f9fc",
        ink: "#071a4d",
      },
      borderRadius: {
        DEFAULT: "5px",
      },
      boxShadow: {
        soft: "0 8px 28px rgba(7, 26, 77, 0.08)",
      },
    },
  },
  plugins: [],
};
