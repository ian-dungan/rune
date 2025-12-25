const path = require("path");

module.exports = {
  // Best for GitHub Pages (prevents /rune vs /Rune issues)
  publicPath: "./",

  configureWebpack: {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/"),
        "@server": path.resolve(__dirname, "server/"),
        shared: path.resolve(__dirname, "server/shared"),
        root: path.resolve(
          __dirname,
          process.env.NODE_ENV === "production" ? "build/" : "server/"
        ),
      },
      extensions: [".js"],
    },
  },
};
