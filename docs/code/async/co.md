# co 库
最近在学习一个库的时候，看到内部的实现是通过了 `co` 这个库来做异步任务的流程自动管理。好奇之下，通过 google 搜索到阮老师写的[co 函数库的含义和用法](http://www.ruanyifeng.com/blog/2015/05/co.html)。`co` 库是由 TJ 大神发布的一个工具，用于 Generator 函数的自动执行。要想理解 `co` 库的实现原理，必须要先弄懂文章内部提及的 `thunk` 函数，于是顺藤摸瓜找到了他的另一个库 `thunkify`。

## Thunk 函数

对于 `thunkify` 这个库的实现而言，Thunk 函数就是将接受多参数，并且最后一个参数必定是回调参数的函数，包装成只接受一个回调函数的函数。说起来比较绕口，我们看如下代码：

```js
// 正常版本的readFile（多参数版本）
fs.readFile(fileName, callback);

// Thunk版本的readFile（单参数版本）
var readFileThunk = Thunk(fileName);
readFileThunk(callback);

var Thunk = function (fileName){
  return function (callback){
    return fs.readFile(fileName, callback); 
  };
};
```

`fs.readFile` 函数接受两个参数，一个是读取文件的路径，一个是回调函数。如果将这个函数 thunkify 化的话，就如上面代码所示，readFileThunk 函数只接受单参数 callback，而 `fileName` 这个参数在之前就已经传入，并且缓存起来了，真正执行 `fs.readFile` 的时机，是在传入 callback的时候。而实现这一切都是利用 js 闭包。

上面的代码不灵活，因为 Thunk 内部是写死了 `fs.readFile` 的，我们来看下 TJ 大神的另一个库 `thunkify` 的源码。

```js
function thunkify(fn){
  assert('function' == typeof fn, 'function required');

  return function(){
    var args = new Array(arguments.length);
    var ctx = this;

    for(var i = 0; i < args.length; ++i) {
      args[i] = arguments[i];
    }

    return function(done){
      var called;

      args.push(function(){
        if (called) return;
        called = true;
        done.apply(null, arguments);
      });

      try {
        fn.apply(ctx, args);
      } catch (err) {
        done(err);
      }
    }
  }
};
```
thunkify 接收一个 fn 作为参数，同时返回一个新匿名函数（暂且称之为 pre-thunkify），pre-thunkify 是用来接收 fn 函数参数的前 1 - n 个参数，最后又返回一个新匿名函数（暂且称之为 thunkify），thunkify 最后接收一个形参为 done 的参数，也就是 fn 函数的 callback 参数。从源码可以看出，done 是用一层函数包裹了，并且用 called 这个标志位来保证 done 只被调用一次。比如下面的代码：

```js
function f(a, b, callback){
  var sum = a + b;
  callback(sum);
  callback(sum);
}

var fThunkify = thunkify(f)(1, 2);
fThunkify(console.log); 

// 3
```

只会执行第一个 callback。为什么要这样设计呢，其实是用来实现 Generator 函数的自动流程管理。总所周知，Generator 函数必须手动的调用 next 方法来执行函数。比如如下代码：

```js
var fs = require('fs');
var thunkify = require('thunkify');
var readFile = thunkify(fs.readFile);

var gen = function* (){
  var r1 = yield readFile('/etc/fstab');
  console.log(r1.toString());
  var r2 = yield readFile('/etc/shells');
  console.log(r2.toString());
};
var g = gen();

var r1 = g.next();
r1.value(function(err, data){
  if (err) throw err;
  var r2 = g.next(data);
  r2.value(function(err, data){
    if (err) throw err;
    g.next(data);
  });
});
```

我们只能靠手动去管理 gen 函数的不同状态，那我们能不能抽象出一种方法，自动的去调用 next 方法呢。

```js
function spawn (gen) {
  let g = gen()
  function step (err, data) {
    let ret = g.next(data)
    if (ret.done) return
    ret.value(step)
  }
  step()
}
spawn(gen)
```

之上的代码也就是利用了 Generator 函数的状态机来不断的递归去调用 step 方法，从而达到自执行的目的。可以从代码看出，yield 后面必须跟着一个 thunk 函数，因为 value 必须是个函数，这样才能不断递归调用 step 方法来执行 next 指针。

## co 库

之前的 thunk 函数，包括简易自执行 Generator 的 spawn 函数都是为了理解怎样去自动管理 Generator。用于生产环境肯定还是需要用 co，所以学习下 co 的源码。