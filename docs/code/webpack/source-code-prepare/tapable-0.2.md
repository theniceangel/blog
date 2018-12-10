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
    
    **源码如下**

    ```js
    Tapable.prototype.applyPlugins = function applyPlugins(name) {
      if(!this._plugins[name]) return;
      var args = Array.prototype.slice.call(arguments, 1);
      var plugins = this._plugins[name];
      for(var i = 0; i < plugins.length; i++)
        plugins[i].apply(this, args);
    };

    Tapable.prototype.plugin = function plugin(name, fn) {
      if(Array.isArray(name)) {
        name.forEach(function(name) {
          this.plugin(name, fn);
        }, this);
        return;
      }
      if(!this._plugins[name]) this._plugins[name] = [fn];
      else this._plugins[name].push(fn);
    };
    ```

    很简单，内部维护 _plugins 属性来缓存 plugin 名称以及 handler。

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

    **源码如下**

    ```js
    Tapable.prototype.apply = function apply() {
      for(var i = 0; i < arguments.length; i++) {
        arguments[i].apply(this);
      }
    };
    ```

    也很简单，依次执行每个插件的 apply 方法。

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

    **源码如下**

    ```js
    Tapable.prototype.applyPluginsWaterfall = function applyPluginsWaterfall(name, init) {
      if(!this._plugins[name]) return init;
      var args = Array.prototype.slice.call(arguments, 1);
      var plugins = this._plugins[name];
      var current = init;
      for(var i = 0; i < plugins.length; i++) {
        args[0] = current;
        current = plugins[i].apply(this, args);
      }
      return current;
    };
    ```

    上一个 handler 返回的值，会作为下一个 handler的第一个参数。

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
    
    **源码如下**

    ```js
    Tapable.prototype.applyPluginsBailResult = function applyPluginsBailResult(name, init) {
      if(!this._plugins[name]) return;
      var args = Array.prototype.slice.call(arguments, 1);
      var plugins = this._plugins[name];
      for(var i = 0; i < plugins.length; i++) {
        var result = plugins[i].apply(this, args);
        if(typeof result !== "undefined") {
          return result;
        }
      }
    };
    ```

    只要 handler 返回的值 `!== undefined`，就会停止调用接下来的 handler。

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

    **源码如下**

    ```js
    Tapable.prototype.applyPluginsAsyncSeries = Tapable.prototype.applyPluginsAsync = function applyPluginsAsyncSeries(name) {
      var args = Array.prototype.slice.call(arguments, 1);
      var callback = args.pop();
      var plugins = this._plugins[name];
      if(!plugins || plugins.length === 0) return callback();
      var i = 0;
      var _this = this;
      args.push(copyProperties(callback, function next(err) {
        if(err) return callback(err);
        i++;
        if(i >= plugins.length) {
          return callback();
        }
        plugins[i].apply(_this, args);
      }));
      plugins[0].apply(this, args);
    };
    ```

    applyPluginsAsyncSeries 内部维护了一个 next 函数，这个函数作为每个 handler 的最后一个参数传入，handler 内部支持异步操作，但是必须手动调用 next 函数，才能执行到下一个 handler。
    
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

    **源码如下**

    ```js
    Tapable.prototype.applyPluginsAsyncSeriesBailResult = function applyPluginsAsyncSeriesBailResult(name) {
      var args = Array.prototype.slice.call(arguments, 1);
      var callback = args.pop();
      if(!this._plugins[name] || this._plugins[name].length === 0) return callback();
      var plugins = this._plugins[name];
      var i = 0;
      var _this = this;
      args.push(copyProperties(callback, function next() {
        if(arguments.length > 0) return callback.apply(null, arguments);
        i++;
        if(i >= plugins.length) {
          return callback();
        }
        plugins[i].apply(_this, args);
      }));
      plugins[0].apply(this, args);
    };
    ```

    applyPluginsAsyncSeriesBailResult 内部维护了一个 next 函数，这个函数作为每个 handler 的最后一个参数传入，handler 内部支持异步操作，但是必须手动调用 next 函数，才能执行到下一个 handler，next 函数可以传入参数，这样会直接执行 callback。

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

    **源码如下**

    ```js
    Tapable.prototype.applyPluginsAsyncWaterfall = function applyPluginsAsyncWaterfall(name, init, callback) {
      if(!this._plugins[name] || this._plugins[name].length === 0) return callback(null, init);
      var plugins = this._plugins[name];
      var i = 0;
      var _this = this;
      var next = copyProperties(callback, function(err, value) {
        if(err) return callback(err);
        i++;
        if(i >= plugins.length) {
          return callback(null, value);
        }
        plugins[i].call(_this, value, next);
      });
      plugins[0].call(this, init, next);
    };
    ```

    applyPluginsAsyncWaterfall 内部维护了一个 next 函数，这个函数作为每个 handler 的最后一个参数传入，handler 内部支持异步操作，但是必须手动调用 next 函数，才能执行到下一个 handler，next 函数可以传入参数，第一个参数为 err， 第二参数为上一个 handler 返回值。

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

    **源码如下**

    ```js
    Tapable.prototype.applyPluginsParallel = function applyPluginsParallel(name) {
      var args = Array.prototype.slice.call(arguments, 1);
      var callback = args.pop();
      if(!this._plugins[name] || this._plugins[name].length === 0) return callback();
      var plugins = this._plugins[name];
      var remaining = plugins.length;
      args.push(copyProperties(callback, function(err) {
        if(remaining < 0) return; // ignore
        if(err) {
          remaining = -1;
          return callback(err);
        }
        remaining--;
        if(remaining === 0) {
          return callback();
        }
      }));
      for(var i = 0; i < plugins.length; i++) {
        plugins[i].apply(this, args);
        if(remaining < 0) return;
      }
    };
    ```

    applyPluginsParallel 并行地调用 handler。内部通过闭包维护了 remaining 变量，用来判断内部的函数是否真正执行完，handler 的最后一个参数是一个函数 check。如果 handler 内部用户想要的逻辑执行完，必须调用 check 函数来告诉 tapable，进而才会执行 args 数组的最后一个 check 函数。

9. ** applyPluginsParallelBailResult **（支持异步）

    ```js
    void applyPluginsParallelBailResult(
      name: string,
      args: any...,
      callback: (err: Error, result: any) -> void
    )
    ```

    并行的执行函数，每个 handler 的最后一个参数都是 next 函数，next 函数必须调用，如果给 next 函数传参，会直接走到 callback 的逻辑。callback 执行的时机是跟 handler 注册的顺序有关，而不是跟 handler 内部调用 next 的时机有关。

    ```js
    t.plugin('applyPluginsParallelBailResult', (next) => {
      console.log(1)
      setTimeout(() => {
        next('has args 1')
      }, 3000)
    })

    t.plugin('applyPluginsParallelBailResult', (next) => {
      console.log(2)
      setTimeout(() => {
        next('has args 2')
      })
    })

    t.plugin('applyPluginsParallelBailResult', (next) => {
      console.log(3)
      next('has args 3')
    })

    t.applyPluginsParallelBailResult('applyPluginsParallelBailResult', (result) => {
      console.log(result)
    })

    // 打印如下
    1
    2
    3
    has args 1

    虽然第一个 handler 的 next 函数是延迟 3s 才执行，但是注册的顺序是在最前面，所以 callback 的 result 参数值是 'has args 1'。
    ```

    **源码如下**

    ```js
    Tapable.prototype.applyPluginsParallelBailResult = function applyPluginsParallelBailResult(name) {
      var args = Array.prototype.slice.call(arguments, 1);
      var callback = args[args.length - 1];
      if(!this._plugins[name] || this._plugins[name].length === 0) return callback();
      var plugins = this._plugins[name];
      var currentPos = plugins.length;
      var currentResult;
      var done = [];
      for(var i = 0; i < plugins.length; i++) {
        args[args.length - 1] = (function(i) {
          return copyProperties(callback, function() {
            if(i >= currentPos) return; // ignore
            done.push(i);
            if(arguments.length > 0) {
              currentPos = i + 1;
              done = fastFilter.call(done, function(item) {
                return item <= i;
              });
              currentResult = Array.prototype.slice.call(arguments);
            }
            if(done.length === currentPos) {
              callback.apply(null, currentResult);
              currentPos = 0;
            }
          });
        }(i));
        plugins[i].apply(this, args);
      }
    };
    ```

    for 循环里面并行的执行 handler，handler 的最后一个参数是一个匿名回调函数，这个匿名函数必须在 handler 里面手动的执行。而 callback 的执行时机就是根据 handler 的注册顺序有关。

从源码上来看，tapable 是提供了很多 API 来对应不同调用 handler 的场景，有同步执行，有异步执行，还有串行异步，并行异步等。这些都是一些高级的技巧，不管是 express，还是 VueRouter 的源码，都利用这些同异步执行机制，但是可以看出程序是有边界的。也就是约定成俗，从最后一个 applyPluginsParallel 函数来看，用户必须调用 check 函数，否则 tapable 怎么知道你内部是否有异步操作，并且异步操作在某个时候执行完了呢。
    