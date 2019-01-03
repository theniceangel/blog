# 怎样实现 Promise

大多数人都使用过 Promise，觉得扁平化的链式调用解决了 “Callback Hell” 的问题，但是很多人却不理解为啥能实现异步，背后的源码到底是怎么实现的。所以在阅读了网上大量资料之后，尝试着手写一个 JPromise 来加深对 Promise 的理解。

## 定义构造函数

```js
const PENDING = 0
const RESOLVED = 1
const REJECTED = 2
// simple promise implements
function JPromise (executor) {
  this.value = undefined
  this.state = PENDING
  this.deferred = []

  let promise = this
  // 为了抓住异常
  try {
    executor(function resolve(x) {
      promise.resolve(x)
    }, function reject(reason) {
      promise.resolve(reason)
    })
  } catch (e) {
    promise.reject(e)
  }
}
```

Promise 有三种状态值，分别是 pending，resolved，rejected。状态只能从 pending -> resolved 或者 pending -> rejected。构造函数接收一个 `executor` 函数，这个函数接收两个参数，`resolve` 和 `reject`。这两个参数也是回调函数，暴露给调用方，只要调用方调用了 `resolve` 或者 `reject`，就代表这个 promise settled了。

## resolve & reject

```js
JPromise.prototype.resolve = function (x) {
  const promise = this
  if (this.state === PENDING) {
    // 防止多次调用
    var magic = false
    // 如果 resolve 的参数也是一个 thenable 对象，直接复用他的所有状态
    try {
      var then = x && x['then']
      if (x != null && typeof x === 'object' && typeof then === 'function') {
        then.call(x, function (x) {
          if (!magic) {
            promise.resolve(x)
            magic = true
          }
        }, function (r) {
          if (!magic) {
            promise.reject(r)
            magic = true
          }
        })
        return
      }
    } catch (error) {
      promise.reject(error)
    }

    this.value = x
    this.state = RESOLVED
  }
}

JPromise.prototype.reject = function (x) {
  if (this.state === PENDING) {
    this.value = x
    this.state = REJECTED
  }
}
```

从上述可以看，resolve 执行的时候是接收调用方传入的值 x，并且将 promise 状态置为 `resolved`。根据 Promise 的规范，resolve 函数是可以接收另外一个 thenable 对象的，所以上面的 try catch 语句就是为了将当前 thenable 的状态传递给 promise。那么什么是 thenable 对象呢。

```js
// thenable 对象,拥有 then 方法，并且方法接收 resolve 和 reject 两个回调函数。
let thenable = {
  then: function(resolve, reject) {
    resolve(42)
  }
}
```

看上去这个好像实现了 resolve 和 reject 的功能，但是其实还是有缺陷的，缺陷在 then 方法的实现时候会碰到。

## then

```js
JPromise.prototype.then = function (onResolved, onRejected) {
  const promise = this
  return new JPromise(function(resolve, reject) {
    promise.deferred.push([onResolved, onRejected, resolve, reject])
    // 异步执行
    promise.notify()
  })
}

JPromise.prototype.notify = function () {
  const promise = this
  nextTick(() => {
    if (promise.state !== PENDING) {
      while (promise.deferred.length) {
        const [onResolved, onRejected, resolve, reject] = promise.deferred.shift()
        try {
          if (promise.state === RESOLVED) {
            if (typeof onResolved === 'function') {
              resolve(onResolved(promise.value))
            } else {
              resolve(promise.value)
            }
          } else if(promise.state === REJECTED) {
            if (typeof onRejected === 'function') {
              // 兼容 JPromise.prototype.catch
              resolve(onRejected(promise.value))
            } else {
              reject(promise.value)
            }
          }
        } catch (error) {
          reject(error)
        }
      }
    }
  })
}
```

Promise 规定，then 方法必须返回一个新 promise，而且接收两个回调函数，onResolved 与 onRejected，回调函数的参数分别是之前 promise 的 value 属性，then 方法首先会把新 promise 的 resolve，reject 以及 onResolved 与 onRejected 推入到之前 promise 的 deferred 数组，因为规定 then 方法必须是异步的，所以我用了类似于 Vue 的 next-tick 的实现方案。

```js
const callbacks = []
let pending = false

const flushCallbacks = function () {
  pending = false
  const copy = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copy.length; i++) {
    copy[i]()
  }
}

let macroTimerFunc = function () {
  setTimeout(flushCallbacks, 0)
}
module.exports = function nextTick (fn) {
  callbacks.push(function () {
    try {
      fn.call()
    } catch (error) {
      console.error(error)
    }
  })

  if (pending === false) {
    pending = true
    macroTimerFunc()
  }
}
```

这个 next-tick 函数，主要是将 fn 推入到一个 callbacks 数组，通过 setTimeout 在下一帧 执行。

最终会调用 notify 方法。这个方法很重要，主要就是拿出通过 then 方法存入的 resolve，reject 以及 onResolved 与 onRejected 四个函数，根据当前 promise 的状态去执行不同的逻辑。其实也就是调用 then 方法新生成的 promise 的 resolve 或者 reject 的过程。

乍一看，好像很完美，then 方法也实现了链式调用。但是考虑到 then 方法 是在 setTimeout(fn, 0) 的时间执行的，如果 executor 这个函数存在很长的异步回调呢，比如下面的例子：

```js
let p = new JPromise((resolve) => {
  setTimeout(() => {
    resolve(1)
  }, 3000)
}).then((x) => {
  console.log(x)
})
```

我们分析下上面的执行情况，因为 then 方法是在下一帧就执行，这个时候 promise 还处于 pending 状态，那么 notify 其实啥也没执行。所以我们需要一种机制，就是在 promise 真正被 resolved 或者 rejected 的时候，再调用 nofity，因此我们需要给 resolve 与 reject 方法**加行代码**。

```diff
JPromise.prototype.resolve = function (x) {
  const promise = this
  if (this.state === PENDING) {
    // 防止多次调用
    var magic = false
    // 如果 resolve 的参数也是一个 thenable 对象，直接复用他的所有状态
    try {
      var then = x && x['then']
      if (x != null && typeof x === 'object' && typeof then === 'function') {
        then.call(x, function (x) {
          if (!magic) {
            promise.resolve(x)
            magic = true
          }
        }, function (r) {
          if (!magic) {
            promise.reject(r)
            magic = true
          }
        })
        return
      }
    } catch (error) {
      promise.reject(error)
    }
+   this.notify() 
    this.value = x
    this.state = RESOLVED
  }
}

JPromise.prototype.reject = function (x) {
  if (this.state === PENDING) {
+   this.notify() 
    this.value = x
    this.state = REJECTED
  }
}
```

## catch

catch 方法的实现就很巧妙。

```js
JPromise.prototype.catch = function (onRejected) {
  return this.then(null, onRejected)
}
```

catch 方法也返回了一个新 promise。会走到 notify 函数体下面的这段代码，从而又能实现链式调用。

```js
if (typeof onRejected === 'function') {
  // 兼容 JPromise.prototype.catch
  resolve(onRejected(promise.value))
}
```

## 静态方法—— JPromise.resolve & JPromise.reject

```js
JPromise.resolve = function (x) {
  return new JPromise((resolve, reject) => {
    resolve(x)
  })
}

JPromise.reject = function (x) {
  return new JPromise((resolve, reject) => {
    reject(x)
  })
}
```

这两个别名很简单，就是生成一个 setted 的 promise。

## 静态方法—— JPromise.all

```js
JPromise.all = function (iterable) {
  if (!Array.isArray(iterable)) return
  return new JPromise(function(resolve, reject) {
    let count = 0
    let result = []
    if (iterable.length === 0) {
      resolve(result)
    }
    function resolvers (i) {
      return function thenResolve(x) {
        result[i] = x
        count++
        if (iterable.length === count) {
          resolve(result)
        }
      }
    }
    for (let i = 0; i < iterable.length; i++) {
      JPromise.resolve(iterable[i]).then(resolvers(i), reject)
    }
  })
}
```

根据 Promise.all 的规范，接收一个 promise 数组，如果有任意一个 promise reject，就触发 reject。所有的 promise 都 resolved，那么在 then 的第一个回调函数的第一个参数就是所有 promise 通过调用 resolve 传出来的值而组成的数组。上面的实现很巧妙，通过一个闭包，每次都会执行 thenResolve 内部的逻辑去检查当前 result 长度是否与传入的 promise 数组的长度相同。在 for 循环当中，只要任意一个 promise rejected，都会走到函数内部返回的 Promise 的 reject 逻辑。

## 静态方法—— JPromise.race

```js
JPromise.race = function (iterable) {
  return new JPromise((resolve, reject) => {
    for (let i = 0; i < iterable.length; i++) {
      JPromise.resolve(iterable[i]).then(resolve, reject)
    }
  })
}
```

race 的实现更巧妙，只要任意的 promise resolved，就执行了新生成的 promise 的 resolve 逻辑了，从而实现了竞态。