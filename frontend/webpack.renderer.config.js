const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const nodeExternals = require('webpack-node-externals');
const CopyWebpackPlugin = require('copy-webpack-plugin'); // 确保正确导入 CopyWebpackPlugin

module.exports = {
  mode: 'development',
  entry: {
    renderer: './src/renderer.mjs'
  },
  target: 'electron-renderer',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js' // 输出文件名为 .js
  },
  resolve: {
    extensions: ['.js', '.mjs'],
    alias: {
      '@components': path.resolve(__dirname, 'src/component')
    }
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html', // 指定 HTML 模板文件
      filename: 'index.html'
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public/marked.min.js', to: 'marked.min.js' } // 复制 marked.min.js 到输出目录
      ]
    })
  ],
  devtool: 'source-map' // 启用源映射
};