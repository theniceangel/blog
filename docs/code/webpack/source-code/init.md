#  核心概念

要想了解 Webpack 的源码，首先得了解清楚这几个概念。

-  `entry`：打包的入口文件。
-  `module`：模块，对于 Webpack 而言，一切皆模块，一个模块对于一个文件。
-  `chunk`：代码块。由多个 `module` 组成。代码块的数量会因为异步代码切割（'code-splitting'），提供公共 CSS，提供 CommonChunk 的一些 Loader 或者 Plugin 而不同。
-  `loader`：模块加载器，Webpack 之所以能打包各种类型的资源，是因为会通过不同的 loader 转换成 js。
-  `plugin`：插件，Webpack 在整个打包构建的生命周期中，提供了不同的 hooks，允许调用方能够对打包的资源注入自己的逻辑处理，赋予了打包构建很大的灵活性。
  
## 构建流程

整体宏观来看，webpack 的打包构建流程如下：

1.  解析命令行与 webpack.config.js 配置的参数，合并生成最后的参数。
2.  分析 Loaders 的配置以及注册不同的 Plugins。
3.  从 entry 入口利用 `acorn` 来构建 AST 语法树，过程应该是**深度遍历的过程**。
4.  在解析的过程中，利用不同的 Loader 去做转换，并且在不同的时期，执行 Plugins 的回调逻辑。
5.  最后输出 chunk，完成打包。