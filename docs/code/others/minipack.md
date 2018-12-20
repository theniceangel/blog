# 手写 mini 打包工具

最近在看 webpack 的源码，所以先浏览了几遍中文官网，发现中文官网有很多错误的地方，给他们提了 pr 也没人合代码，下定决心弃掉中文官网，因此从英文官网开始看起，偶然间发现了一个 youtube 的视频[Live Coding a Simple Module Bundler](https://www.youtube.com/watch?v=Gc9-7PBqOC8)，这个视频的内容是讲解如何编写一个 mini 版本的 webpack。看起来很简单，但是很有趣，写篇读后感吧。

## 准备

首先，我们得知道什么是 module。module 就是对外形成封闭的作用域，通过一定的 API 去暴露内部细节，而且 module 是存在相互依赖关系的，所以我们需要以下的数据结构来表示 module。

```js
{
  id: 0
  filename: 'file1.js',
  dependencies: []
}
```
dependencies 字段来收集依赖。

## 收集依赖

```js
const fs = require('fs')
const babylon = require('babylon')
const traverse = require('babel-traverse').default
const { transformFromAst } = require('babel-core')
const path = require('path')
let aid = 0

const createAsset = (filename) => {
  const id = aid++
  const dependencies = []
  const content = fs.readFileSync(filename, 'utf-8')

  // 转化成ast
  const ast = babylon.parse(content, {
    sourceType: 'module'
  })
  
  // 查找出依赖的文件名
  traverse(ast, {
    ImportDeclaration ({ node }) {
      dependencies.push(node.source.value)
    } 
  })

  // 转化 ES6 的语法
  const { code } = transformFromAst(ast, null, {
    presets: ['env']
  })

  return {
    id,
    filename,
    dependencies,
    code
  }
}
```

我们得通过一个函数来收集依赖，命名为 `createAsset`，入参是文件路径，通过 fs.readFileSync 得到文件内容。这个时候，我们需要知道到底依赖了哪些其他模块，也就是检验 import 语法后的值，引入了 `babylon` 这个工具，将文件内容字符串转化成 AST，并且通过 `babel-traverse` 去遍历生成的 AST，在遍历的时候，就能找到依赖。其中由于我们模块使用了 ES6 的语法，所以用 babel 转化成 ES5 的语法，最后就得出了这个 module 的信息。

从上面看，这只是解析一个 module 的函数，由于 module 存在各种依赖的关系，我们怎么得到所有的模块的依赖关系呢。

```js
// 生成 graph

const createGraph = (entry) => {
  // 先得到入口 module 的信息
  const mainAsset = createAsset(entry)
  const queue = [mainAsset]

  // 递归分析模块之间的依赖
  for (const asset of queue) {
    asset.mapping = {}
    const dirname = path.dirname(asset.filename)
    asset.dependencies.forEach((relativePath) => {
      const absolutePath = path.join(dirname, relativePath)

      // 得到当前模块 asset 依赖的模块
      const child = createAsset(absolutePath)
      asset.mapping[relativePath] = child.id

      // 递归分析 child 模块依赖的模块
      queue.push(child)
    })
  }
  return queue
}
```

可以看到上面的实现很巧妙，利用一个数组实现了递归的依赖收集。

## bundle

得到了依赖图之后，我们就需要打包并且生成依赖了。

```js
const bundle = (graph) => {
  let modules = ''
  graph.forEach((mod) => {
    modules += `${mod.id}: [
      function (module, exports, require) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)}
    ],
    `
  })
  const ret = `(function(modules){
    function require (id) {
      const [fn, mapping] = modules[id];
      function localRequire(name) {
        return require(mapping[name]);
      }
      let module = {
        exports: {},
        loaded: false
      };
      fn(module, module.exports, localRequire);
      
      module.loaded = true;
      return module.exports
    }
  
    require(0)
  })({${modules}});`

  fs.writeFile(path.join(__dirname, '../example/bundle.js'), ret)
}
```

最后输出一个拥有自执行函数的文件，生成的文件内容类似于如下：

```js
(function(modules) {

function require (id) {
  const [fn, mapping] = modules[id];
  function localRequire(name) {
    return require(mapping[name]);
  }
  let module = {
    exports: {},
    loaded: false
  };
  fn(module, module.exports, localRequire);

  module.loaded = true;
  return module.exports
}
  // 程序启动
  require(0)

})({
  0: [
    function (module, exports, require) {
      var a = require('./a.js')
      console.log(a.name)
    }, 
    {
      './a.js': 1
    }
  ],
  1: [
    function (module, exports, require) {
      exports.name = 'jizhi'
    }, 
    {

    }
  ]
})
```

最后大工告成，[完整的例子](https://github.com/theniceangel/mini-bundle-pack)在这。

