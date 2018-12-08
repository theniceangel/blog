# tapable(0.2 版本)

webpack 是基于事件流的打包构建工具，也就是内置了很多 hooks。作为使用方，可以在这些钩子当中，去插入自己的处理逻辑，而这一切的实现都得益于 tapable 这个工具。它有多个版本，webpack 前期的版本是依赖于 tapable 0.2 这个版本，后来重构了，发了 2.0 beta 版本，因为源码都是通过字符串拼接，通过 new Function 的模式使用，所以看起来比较晦涩。

那么既然如此，我们先从早期的 0.2 这个版本了解下它的前身，毕竟核心思想不会发生太大的变化。

tapable 的实现类似于 node 的 EventEmitter 的发布订阅模式。用一个对象的键存储对应的事件名称，键值来存储事件的处理函数，类似于下面：

```js
function Tapable () {
  this._plugins = {
    'emit': [handler1, handler2, ......]
  }
}
```

同时，原型上定义了不同的方法来调用 handlers。

我们先来看下用法，

1.  **plugin** 与 **applyPlugins**
   
    ```js
    void plugin(names: string|string[], handler: Function)
    void applyPlugins(name: string, args: any...)
    ```

    最基础的就是注册插件以及插件触发的回调函数。

    ```js
    const Tapable = require('tapable')
    const t = new Tapable()

    // 注册插件
    t.plugin('emit', (...args) => {
      console.log(args)
      console.log('This is a emit handler')
    })

    // 调用插件
    t.applyPlugins('emit', '参数1')

    // 打印如下
    [ '参数1' ]
    This is a emit handler
    ```

2.  **apply**

    ```js
    void apply(plugins: Plugin...)
    ```

    接收 plugin 作为参数，每个 plugin 必须提供 apply 方法，也就是 webpack 在编写 plugin 的规是插件实例必须提供 apply 方法。

    ```js
    const Tapable = require('tapable')
    const t = new Tapable()
    
    // 声明一个 webpack 插件的类，对象必须声明 apply 方法
    class WebpackPlugin {
      constructor () {}
      apply () {
        console.log('This is webpackPlugin')
      }
    }

    const plugin = new WebpackPlugin()
    
    // tapable.apply
    t.apply(plugin) // print 'This is webpackPlugin'
    ```

3.  **applyPluginsWaterfall**

    ```js
    any applyPluginsWaterfall(name: string, init: any, args: any...)
    ```

    依次调用插件对应的 handler，传入的参数是上一个 handler 的返回值，以及调用 applyPluginsWaterfall 传入 args 参数组成的数组，说起来很绕，看看下面的例子：

    ```js
    t.plugin('waterfall', (...args) => {
      // print ['init', 'args1']
      console.log(args)
      return 'result1'
    })

    t.plugin('waterfall', (...args) => {
      // print ['result1', 'args1']
      console.log(args)
      return 'result2'
    })

    const ret = t.applyPluginsWaterfall('waterfall', 'init', 'args1') // ret => 'result2'
    ```

4.  **applyPluginsBailResult**

    ```js
    any applyPluginsBailResult(name: string, args: any...)
    ```

    依次调用插件对应的 handler，传入的参数是 args，如果正执行的 handler 的 返回值不是 undefined，其余的 handler 都不会执行了。 `bail` 是保险的意思，即只要任意一个 handler 有 `!== undefined` 的返回值，那么函数的执行就终止了。

    ```js
    t.plugin('bailResult', (...args) => {
      // [ '参数1', '参数2' ]
      console.log(args)
      return 'result1'
    })

    t.plugin('bailResult', (...args) => {
      // 因为上一个函数返回了 'result1'，所以不会执行到这个handler
      console.log(args)
      return 'result2'
    })

    t.applyPluginsBailResult('bailResult', '参数1', '参数2')
    ```
    
5.  **applyPluginsAsyncSeries & applyPluginsAsync**（支持异步）

    ```js
    void applyPluginsAsync(
      name: string,
      args: any...,
      callback: (err?: Error) -> void
    )
    ```

    applyPluginsAsyncSeries 与 applyPluginsAsync 的函数引用都是相同的，并且函数内部支持异步。callback 在所有 handler 都执行完了才会调用，但是在注册 handler 的时候，函数内部一定要执行 next() 的逻辑，这样才能执行到下一个 handler。

    ```js
    t.plugin('asyncSeries', (...args) => {
      // handler 的最后一个参数一定是 next 函数
      const next = args.pop()
      // 执行 next，函数才会执行到下面的 handler
      setTimeout (() => {
        next()
      }, 3000)
    })

    t.plugin('asyncSeries', (...args) => {
      // handler 的最后一个参数一定是 next
      const callback = args.pop()
      // 执行 next，函数才会执行到 applyPluginsAsyncSeries 传入的 callback
      Promise.resolve(1).then(next)
    })

    t.applyPluginsAsyncSeries('asyncSeries', '参数1', (...args) => {
      console.log('这是 applyPluginsAsyncSeries 的 callback')
    })
    ```
    
6.  **applyPluginsAsyncSeriesBailResult**（支持异步） 

    ```js
    void applyPluginsAsyncSeriesBailResult(
      name: string,
      args: any...,
      callback: (result: any) -> void
    )
    ```

    函数支持异步，只要在 handler 里面调用 next 回调函数，并且传入任意参数，就会直接执行 callback。

    ```js
    t.plugin('asyncSeriesBailResult', (...args) => {
      // handler 的最后一个参数一定是 next 函数
      const next = args.pop()
      // 因为传了字符串，导致直接执行 callback
      next('跳过 handler 函数')
    })

    t.plugin('asyncSeriesBailResult', (...args) => {
      
    })

    t.applyPluginsAsyncSeriesBailResult('asyncSeriesBailResult', '参数1', (...args) => {
      console.log('这是 applyPluginsAsyncSeriesBailResult 的 callback')
    })
    // print '这是 applyPluginsAsyncSeriesBailResult 的 callback'
    ```

7.  **applyPluginsAsyncWaterfall**（支持异步）

    ```js
    void applyPluginsAsyncWaterfall(
      name: string,
      init: any,
      callback: (err: Error, result: any) -> void
    )
    ```

    函数支持异步，handler 的接收两个参数，第一个参数是上一个 handler 通过 next 函数传过来的 value，第二个参数是 next 函数。next 函数接收两个参数，第一个是 error，如果 error 存在，就直接执行 callback。第二个 value 参数，是传给下一个 handler 的参数。

    ```js
    t.plugin('asyncWaterfall', (value, next) => {
    // handler 的最后一个参数一定是 next 函数
      console.log(value)
      next(null, '来自第一个 handler')
    })

    t.plugin('asyncWaterfall', (value, next) => {
      console.log(value)
      next(null, '来自第二个 handler')
    })

    t.applyPluginsAsyncWaterfall('asyncWaterfall', '参数1', (err, value) => {
      if (!err) {
        console.log(value)
      }
    })
    
    // 打印如下

    参数1
    来自第一个 handler
    来自第二个 handler
    ```

8.  **applyPluginsParallel**（支持异步）

    ```js
    void applyPluginsParallel(
      name: string,
      args: any...,
      callback: (err?: Error) -> void
    )
    ```

    并行的执行函数，每个 handler 的最后一个参数都是 next 函数，这个函数用来检验当前的 handler 是否已经执行完。

    ```js
    t.plugin('parallel', (...args) => {
      const next = args.pop()
      console.log(1)
      // 必须调用 next 函数，要不然 applyPluginsParallel 的 callback 永远也不会回调
      next('抛出错误了1', '来自第一个 handler')
    })

    t.plugin('parallel', (...args) => {
      const next = args.pop()
      console.log(2)
      // 必须调用 next 函数，要不然 applyPluginsParallel 的 callback 永远也不会回调
      next('抛出错误了2')
    })

    t.applyPluginsParallel('parallel', '参数1', (err) => {
      // print '抛出错误了1'
      console.log(err)
    })
    ```

从源码上来看，tapable 是提供了很多 API 来对应不同调用 handler 的场景，有同步执行，有异步执行，还有串行异步，并行异步等。这些都是珍贵的技巧，不管是 express，还是 VueRouter 的源码，都利用这些同异步执行机制。    
    