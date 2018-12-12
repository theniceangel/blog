# tapable (2.0.0-beta 版本)

之前看了 tapable 0.2 版本的源码，看起来很好懂，但是也存在一些缺点，就是无法明确地知道 plugin 是属于同步，还是异步，而且关于 async 的插件都是采用递归的方式，有点"杂乱无章的感觉"，

但是 tapable 2.0.0-beta 版本的重构，犹如艺术品一般，让人惊艳。源码内部采用 getter 惰性加载与缓存的方式，以及利用 new Function 去消除递归调用。

消除递归调用的方式就是在第一次调用 call 的时候，通过字符串拼接可执行的字符串代码（源码内部称之为 compile），通过 new Function 来生成 fn，并且缓存下来。这样的作用就是将递归代码非递归化，能减少内存的消耗。

先来张图，直观感受下 Tapable 的架构，为什么称之为艺术。

<img :src="$withBase('/assets/tapable-2.0.0.list.png')" width="100%" alt="tapable-2.0.0.list">

可以看出 Tabable 重构之后多了一个 Hook 的概念，有同步钩子，异步串行钩子，异步并行钩子等。每种钩子都是一个类，它们都是继承于 Hook 基类。阐述下各种 Hook 类的作用。

## Hook 类

  名称|钩入的方式|作用
  ----|----|----
  Hook   | `tap`， `tapAsync`，`tapPromise` | 钩子基类
  SyncHook   | `tap` | 同步钩子
  SyncBailHook   | `tap` | 同步钩子，只要执行的 handler 有返回值，剩余 handler 不执行
  SyncLoopHook   | `tap` | 同步钩子，只要执行的 handler 有返回值，一直循环执行此 handler
  SyncWaterfallHook  | `tap` | 同步钩子，上一个 handler 的返回值作为下一个 handler 的输入值
  AsyncParallelBailHook  | `tap` | 同步钩子，上一个 handler 的返回值作为下一个 handler 的输入值
  AsyncParallelHook  | `tap` | 异步钩子，handler 并行触发
  AsyncSeriesBailHook  | `tap` | 异步钩子，handler 并行触发，但是跟 handler 内部调用回调函数的逻辑有关
  AsyncSeriesHook  | `tap` | 异步钩子，handler 串行触发
  AsyncSeriesLoopHook  | `tap` | 异步钩子，可以触发 handler 循环调用
  AsyncSeriesWaterfallHook  | `tap` | 异步钩子，上一个 handler 可以根据内部的回调函数传值给下一个 handler

## Hook Helper 与 Tapable 类

  名称|作用
  ----|----|
  HookCodeFactory  |  编译生成可执行 fn 的工厂类  |
  HookMap  |  Map 结构，存储多个 Hook 实例  |
  MultiHook  | 组合多个 Hook 实例  |
  Tapable  |  向前兼容老版本，实例必须拥有 hooks 属性  |

## 简单上手

tapable 2.0.0-beta 版本的使用跟之前分析的 0.2.8 版本完全不同，但是实现的功能，以及原理是一致的。

```js
const { SyncHook } = require('tapable')

// 实例化 SyncHook
const sh = new SyncHook(['arg1'])

// 通过 tap 注册 handler
sh.tap('1', function (arg1, arg2) {
    console.log(arg1, arg2, 1);
});
sh.tap({
  name: '2',
  before: '1',
}, function (arg1) {
    console.log(arg1, 2);
});
sh.tap({
  name: '3',
  stage: -1,
}, function (arg1) {
    console.log(arg1, 3);
});

// 通过 call 执行 handler
sh.call('tapable', 'tapable-2.0.0')

// 打印顺序如下
tapable, 3
tapable, 2
tapable, undefined, 1
```

如上所述，实例化 SyncHook 的时候接收字符串数组。它的长度会影响你通过 call 方法调用 handler 时入参个数。就像例子所示，调用 call 方法传入的是两个参数，实际上 handler 只能接收到一个参数，因为你在 new SyncHook 的时候传入的字符串数组长度是1。SyncHook 对象是通过 tap 方法去注册 handler的，第一个参数必须是字符串或者对象，其实即使是字符串，也会在内部转成对象，变成如下结构：

```js
interface Tap {
  name: string, // 标记每个 handler，必须有
  before: string | array, // 插入到指定的 handler 之前
	type: string, // 类型：'sync', 'async', 'promise'
	fn: Function, // handler
	stage: number, // handler 顺序的优先级，默认为 0，越小的排在越前面执行
	context: boolean // 内部是否维护 context 对象，这样在不同的 handler 就能共享这个对象
}
```

因为我 name 为 2 的 handler 注册的时候，是传了一个对象，它的 before 属性为 1，说明这个 handler 要插到 name 为 1 的 handler 之前执行，而且打印的顺序在第二位，但是又因为 name 为 3 的 handler 注册的时候，stage 属性为 -1，比其他的 handler 的 stage 要小，所以它会被移到最前面执行。

## 探索原理

那么既然我们从 SyncHook 这个最简单的钩子类入手，也知道了如何使用，那么我们从源码的角度来感受下 Tapable 重构版犹如艺术版的架构设计吧。找到入口 `tapable/index.js`

```
exports.__esModule = true;
exports.Tapable = require("./Tapable");
exports.SyncHook = require("./SyncHook");
exports.SyncBailHook = require("./SyncBailHook");
exports.SyncWaterfallHook = require("./SyncWaterfallHook");
exports.SyncLoopHook = require("./SyncLoopHook");
exports.AsyncParallelHook = require("./AsyncParallelHook");
exports.AsyncParallelBailHook = require("./AsyncParallelBailHook");
exports.AsyncSeriesHook = require("./AsyncSeriesHook");
exports.AsyncSeriesBailHook = require("./AsyncSeriesBailHook");
exports.AsyncSeriesWaterfallHook = require("./AsyncSeriesWaterfallHook");
exports.HookMap = require("./HookMap");
exports.MultiHook = require("./MultiHook");
```

各种钩子类以及钩子辅助类都挂载在对应的属性上。我们先来看 SyncHook。

```js
const Hook = require("./Hook");
const HookCodeFactory = require("./HookCodeFactory");

class SyncHookCodeFactory extends HookCodeFactory {
	content({ onError, onResult, onDone, rethrowIfPossible }) {
		return this.callTapsSeries({
			onError: (i, err) => onError(err),
			onDone,
			rethrowIfPossible
		});
	}
}

const factory = new SyncHookCodeFactory();

class SyncHook extends Hook {
	tapAsync() {
		throw new Error("tapAsync is not supported on a SyncHook");
	}

	tapPromise() {
		throw new Error("tapPromise is not supported on a SyncHook");
	}

	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

module.exports = SyncHook;
```

可以看出，SyncHook 是继承于父类 Hook，并且原型上重写了 tapAsync、tapPromise、compile 三个方法，也就是 SyncHook 不支持通过 tapAsync 与 tapPromise 来注册 handler 的，因为它内部的逻辑是不支持异步的。compile 方法是用来编译生成对应的 fn，而调用 call 方法，其实就是执行了编译生成的 fn。这个是后话，我们先来看下 Hook 类的实现，所有的钩子都是继承于 Hook 基类。

```js
const util = require("util");

const deprecateContext = util.deprecate(() => {},
"Hook.context is deprecated and will be removed");

class Hook {
	constructor(args) {
		if (!Array.isArray(args)) args = []; // args 必须是数组
    this._args = args;
		this.taps = []; // 存放每次执行 tap 方法的生成的 options 对象
    this.interceptors = []; //存放拦截器
    /**
     *  以下三种方法都是惰性加载，再执行一次之后，会缓存编译的 fn，
     *  只有在加入新 handler 的情况下，才会重新编译，缓存编译生成的新 fn
     *  而 fn 其实函数体内将之前版本递归部分都磨平了，这样会减少内存的消耗。
     **/
    // 提供 call 方法，执行 sync handler
    this.call = this._call;
    // 提供 promise 方法，执行 promise handler
    this.promise = this._promise;
    // 提供 callAsync 方法，执行 async handler
    this.callAsync = this._callAsync;
    // 会在编译的 setup 期间过滤 this.taps 得到所有的 handler 组成的数组
		this._x = undefined;
	}

  // 所有子类都必须重写编译方法，因为每个 Hook 子类都有自己的 compile rules。
	compile(options) {
		throw new Error("Abstract: should be overriden");
	}

	_createCall(type) {
		return this.compile({
			taps: this.taps,
			interceptors: this.interceptors,
			args: this._args,
			type: type
		});
	}

  //  注册 'sync' fn
	tap(options, fn) {
		if (typeof options === "string") options = { name: options };
		if (typeof options !== "object" || options === null)
			throw new Error(
				"Invalid arguments to tap(options: Object, fn: function)"
			);
		if (typeof options.name !== "string" || options.name === "")
			throw new Error("Missing name for tap");
		if (typeof options.context !== "undefined") deprecateContext();
		options = Object.assign({ type: "sync", fn: fn }, options);
		options = this._runRegisterInterceptors(options);
		this._insert(options);
  }
  
  //  注册 'async' fn
	tapAsync(options, fn) {
		if (typeof options === "string") options = { name: options };
		if (typeof options !== "object" || options === null)
			throw new Error(
				"Invalid arguments to tapAsync(options: Object, fn: function)"
			);
		if (typeof options.name !== "string" || options.name === "")
			throw new Error("Missing name for tapAsync");
		if (typeof options.context !== "undefined") deprecateContext();
		options = Object.assign({ type: "async", fn: fn }, options);
		options = this._runRegisterInterceptors(options);
		this._insert(options);
	}

  //  注册 'promise' fn
	tapPromise(options, fn) {
		if (typeof options === "string") options = { name: options };
		if (typeof options !== "object" || options === null)
			throw new Error(
				"Invalid arguments to tapPromise(options: Object, fn: function)"
			);
		if (typeof options.name !== "string" || options.name === "")
			throw new Error("Missing name for tapPromise");
		if (typeof options.context !== "undefined") deprecateContext();
		options = Object.assign({ type: "promise", fn: fn }, options);
		options = this._runRegisterInterceptors(options);
		this._insert(options);
	}

  // 每次执行 tap 的时候，传入的 options 都要经过 interceptor.register 函数的逻辑。
	_runRegisterInterceptors(options) {
		for (const interceptor of this.interceptors) {
			if (interceptor.register) {
				const newOptions = interceptor.register(options);
				if (newOptions !== undefined) {
					options = newOptions;
				}
			}
		}
		return options;
	}

	withOptions(options) {
		const mergeOptions = opt =>
			Object.assign({}, options, typeof opt === "string" ? { name: opt } : opt);

		// Prevent creating endless prototype chains
		options = Object.assign({}, options, this._withOptions);
		const base = this._withOptionsBase || this;
		const newHook = Object.create(base);

		newHook.tap = (opt, fn) => base.tap(mergeOptions(opt), fn);
		newHook.tapAsync = (opt, fn) => base.tapAsync(mergeOptions(opt), fn);
		newHook.tapPromise = (opt, fn) => base.tapPromise(mergeOptions(opt), fn);
		newHook._withOptions = options;
		newHook._withOptionsBase = base;
		return newHook;
	}

	isUsed() {
		return this.taps.length > 0 || this.interceptors.length > 0;
	}

  // 注册拦截器
	intercept(interceptor) {
		this._resetCompilation();
		this.interceptors.push(Object.assign({}, interceptor));
		if (interceptor.register) {
			for (let i = 0; i < this.taps.length; i++) {
				this.taps[i] = interceptor.register(this.taps[i]);
			}
		}
	}

  // 每次注册新 handler，要重新编译
	_resetCompilation() {
		this.call = this._call;
		this.callAsync = this._callAsync;
		this.promise = this._promise;
	}
  // 插入 tap 对象，可能根据 before，stage 属性，调整 handler 的执行顺序
	_insert(item) {
		this._resetCompilation();
		let before;
		if (typeof item.before === "string") {
			before = new Set([item.before]);
		} else if (Array.isArray(item.before)) {
			before = new Set(item.before);
		}
		let stage = 0;
		if (typeof item.stage === "number") {
			stage = item.stage;
		}
		let i = this.taps.length;
		while (i > 0) {
			i--;
			const x = this.taps[i];
			this.taps[i + 1] = x;
			const xStage = x.stage || 0;
			if (before) {
				if (before.has(x.name)) {
					before.delete(x.name);
					continue;
				}
				if (before.size > 0) {
					continue;
				}
			}
			if (xStage > stage) {
				continue;
			}
			i++;
			break;
		}
		this.taps[i] = item;
	}
}

function createCompileDelegate(name, type) {
	return function lazyCompileHook(...args) {
    // 重新 this.call, this.promise, this.callAsync
    // 因为第一个调用 call 的时候，会走到 _createCall 去 compile，生成 fn
    // 但是第二次调用 call 的时候，fn 已经赋值给了 this.call 了，不需要走到 compile 的逻辑了。
		this[name] = this._createCall(type);
		return this[name](...args);
	};
}

Object.defineProperties(Hook.prototype, {
	_call: {
		value: createCompileDelegate("call", "sync"),
		configurable: true,
		writable: true
	},
	_promise: {
		value: createCompileDelegate("promise", "promise"),
		configurable: true,
		writable: true
	},
	_callAsync: {
		value: createCompileDelegate("callAsync", "async"),
		configurable: true,
		writable: true
	}
});

module.exports = Hook;
```

可以看到，Hook 提供了 tap、tapAsync、tapPromise 来注册 handler，通过了 call、callAsync、promise 三种方式来调用 handler，同时内部还对这三种调用方式做了惰性求值，并且会缓存编译结果直到注入了新 handler。

分析完 Hook 类的大致功能，我们再回到 SyncHook 类。发现 compile 方法里面 new SyncHookCodeFactory。从字面上的理解就是生成同步钩子代码的工厂类，它继承于 HookCodeFactory 类。那么分析下 `HookCodeFactory.js`。

```js
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

class HookCodeFactory {
	constructor(config) {
		this.config = config;
		this.options = undefined;
		this._args = undefined;
	}

	create(options) {
		this.init(options);
		let fn;
		switch (this.options.type) {
			case "sync":
				fn = new Function(
					this.args(),
					'"use strict";\n' +
						this.header() +
						this.content({
							onError: err => `throw ${err};\n`,
							onResult: result => `return ${result};\n`,
							onDone: () => "",
							rethrowIfPossible: true
						})
				);
				break;
			case "async":
				fn = new Function(
					this.args({
						after: "_callback"
					}),
					'"use strict";\n' +
						this.header() +
						this.content({
							onError: err => `_callback(${err});\n`,
							onResult: result => `_callback(null, ${result});\n`,
							onDone: () => "_callback();\n"
						})
				);
				break;
			case "promise":
				......
				fn = new Function(this.args(), code);
				break;
		}
		this.deinit();
		return fn;
	}

	setup(instance, options) {
		instance._x = options.taps.map(t => t.fn);
	}

	init(options) {
		this.options = options;
		this._args = options.args.slice();
	}

	deinit() {
		this.options = undefined;
		this._args = undefined;
	}

	header() {
		let code = "";
		......
		return code;
	}

	needContext() {
		for (const tap of this.options.taps) if (tap.context) return true;
		return false;
	}

	callTap(tapIndex, { onError, onResult, onDone, rethrowIfPossible }) {
		......
		return code;
	}

	callTapsSeries({ onError, onResult, onDone, rethrowIfPossible }) {
    ......
	}

	callTapsLooping({ onError, onDone, rethrowIfPossible }) {
		......
	}

	callTapsParallel({
		onError,
		onResult,
		onDone,
		rethrowIfPossible,
		onTap = (i, run) => run()
	}) {
		......
		return code;
	}

	args({ before, after } = {}) {
		......
	}

  ......
}

module.exports = HookCodeFactory;

```

HookCodeFactory 的原型上有很多方法，但是千万不要慌，也不要畏惧。如果看不懂代码，我们可以一步步 debugger 去调试。

SyncHook 在执行 compile 的时候会调用 HookCodeFactory 的 setup、create 方法，我们先来看下这两个方法

```js
setup(instance, options) {
  // 过滤出传入的 handler
  instance._x = options.taps.map(t => t.fn);
}
init(options) {
  this.options = options;
  this._args = options.args.slice();
}
deinit() {
  this.options = undefined;
  this._args = undefined;
}
create(options) {
  // 获取调用方 new SyncHook(options)
  this.init(options);
  let fn;
  // 判断 handler 的类型，通过 new Function 将字符串变成 fn
  switch (this.options.type) {
    case "sync":
      fn = new Function(
        this.args(),
        '"use strict";\n' +
          this.header() +
          this.content({
            onError: err => `throw ${err};\n`,
            onResult: result => `return ${result};\n`,
            onDone: () => "",
            rethrowIfPossible: true
          })
      );
      break;
    case "async":
      fn = new Function(
        this.args({
          after: "_callback"
        }),
        '"use strict";\n' +
          this.header() +
          this.content({
            onError: err => `_callback(${err});\n`,
            onResult: result => `_callback(null, ${result});\n`,
            onDone: () => "_callback();\n"
          })
      );
      break;
    case "promise":
      ......
      fn = new Function(this.args(), code);
      break;
  }
  // 重置参数，因为 SyncHook 类保存的是一份 HookCodeFactory 类的实例，所以每次编译完，为了防止影响 其他SyncHook 实例。
  this.deinit();
  // 返回编译生成的函数
  return fn;
}
```

从执行的逻辑来看，就是先从 taps 里面过滤出 handler，然后根据类型来生成对应的 fn。所以我们在调用 call、callAsync、promise 的时候，执行就是编译生成的 fn，并且把参数传入。

上面的例子是用到的 SyncHook，只会走到 `case "sync"` 的逻辑，我们**重点分析**如何生成 fn 的，其余的也是依葫芦画瓢。

```js
fn = new Function(
  this.args(),
  '"use strict";\n' +
    this.header() +
    this.content({
      onError: err => `throw ${err};\n`,
      onResult: result => `return ${result};\n`,
      onDone: () => "",
      rethrowIfPossible: true
    })
);
```

那我们从下面三个步骤来看：
    
-  **生成 fn 的形参**

    ```js
    args({ before, after } = {}) {
      let allArgs = this._args;
      if (before) allArgs = [before].concat(allArgs);
      if (after) allArgs = allArgs.concat(after);
      if (allArgs.length === 0) {
        return "";
      } else {
        return allArgs.join(", ");
      }
    }
    ```

    根据实例化 SyncHook 传入的参数以逗号拼接形参字符串。支持 before 与 after 属性，能够在字符串的头部或者尾部插入对应的属性值字符串。比如 new SyncHook(['arg1', 'arg2'])，那么经过 this.args 处理后，就变成 "arg1, arg2"。再通过 fn = new Function("arg1, arg2") 之后，就变成 fn 接收 arg1 与 arg2两个形参了。假如你在使用 call 方法的时候传入三个参数，那么第三个参数就获取不到了，因为 fn 只支持两个参数。

-  **生成 fn 函数体的头部代码字符串**

    ```js
    header() {
      let code = "";
      // tap 的时候传入了 {context: true}
      if (this.needContext()) {
        code += "var _context = {};\n";
      } else {
        code += "var _context;\n";
      }
      code += "var _x = this._x;\n";
      if (this.options.interceptors.length > 0) {
        code += "var _taps = this.taps;\n";
        code += "var _interceptors = this.interceptors;\n";
      }
      for (let i = 0; i < this.options.interceptors.length; i++) {
        const interceptor = this.options.interceptors[i];
        if (interceptor.call) {
          code += `${this.getInterceptor(i)}.call(${this.args({
            before: interceptor.context ? "_context" : undefined
          })});\n`;
        }
      }
      return code;
    }

    needContext() {
      for (const tap of this.options.taps) if (tap.context) return true;
      return false;
    }

    getInterceptor(idx) {
      return `_interceptors[${idx}]`;
    }
    ```

    header 函数主要是生成头部的一些参数，可以看到如果通过 tap、tapPromise、tapAsync 注册 handler的时候传入了 `context: true`，那么会生成 _context 对象，并且会将 _context 传入每一个 handler，因为这是个对象引用，所以对于每个 handler 来说，其实是共享了一份 _context 对象。同时 Hook 是支持通过 intercept 方法注册拦截器的，该方法接收一个对象作为入参，该对象都会保存在钩子实例的 interceptors 数组。数据结构如下：

    ```js
    interface HookInterceptor {
      call: (context?, ...args) => void, // 还未开始执行 handler 之前执行
      loop: (context?, ...args) => void,
      tap: (context?, tap: Tap) => void, // 插入一个 handler
      register: (tap: Tap) => Tap, // 改变 tap 对象
      context: boolean
    }
    ```

    从接口来看，我们可以通过 intercept 方法来插入自己的逻辑，不仅是注册 handler 还是改变 tap 对象，这样使得钩子变得更灵活，更有弹性。
  
-  **生成 fn 函数体的中间执行代码的字符串**

    看完了 header 的逻辑，我们再来看 content 的逻辑，因为 content 对于每种钩子的代码生成都不一样，所以是在对应的钩子生成的工厂类上做了覆盖，那么对于 SyncHook 而言，content 是在 SyncHookCodeFactory 这个工厂类重写了 content 方法。

    ```js
    class SyncHookCodeFactory extends HookCodeFactory {
      content({ onError, onResult, onDone, rethrowIfPossible }) {
        return this.callTapsSeries({
          onError: (i, err) => onError(err),
          onDone,
          rethrowIfPossible
        });
      }
    }
    ```

    可以看到 SyncHookCodeFactory 这个类的 content 方法是接收一个对象，并且内部又调用了 HookCodeFactory 类上的 callTapsSeries 方法，同时将 onError、onDone、rethrowIfPossible 传入了。我们看下 `callTapsSeries` 的定义。

    ```js
    callTapsSeries({ onError, onResult, onDone, rethrowIfPossible }) {
      if (this.options.taps.length === 0) return onDone();
      const firstAsync = this.options.taps.findIndex(t => t.type !== "sync");
      const next = i => {
        if (i >= this.options.taps.length) {
          return onDone();
        }
        const done = () => next(i + 1);
        const doneBreak = skipDone => {
          if (skipDone) return "";
          return onDone();
        };
        return this.callTap(i, {
          onError: error => onError(i, error, done, doneBreak),
          onResult:
            onResult &&
            (result => {
              return onResult(i, result, done, doneBreak);
            }),
          onDone:
            !onResult &&
            (() => {
              return done();
            }),
          rethrowIfPossible:
            rethrowIfPossible && (firstAsync < 0 || i < firstAsync)
        });
      };
      return next(0);
    }
    ```

    从上面可以看出函数内部维护了一个 next 函数，next 函数内部会调用 callTap，而 callTap 内部会在合适的时机调用 done，那么又会走到 next 函数，那么这样就形成了自执行的机制，而函数退出的条件就是遍历了所有的 this.options.taps 之后，这个数据是维护了我们通过 tap、tapPromise、tapAsync 注册 handler 的信息。

##  阻力与寻找解决办法。

从上面剖析 SyncHook 源码的结果来看，尤其是 compile 那块涉及到拼接字符串，通过 new Function 生成 fn。这一块可阅读性比较差，所以我们以具体的 Hook 类的使用场景，来覆盖源码的每个步骤，一步步调试。

## 同步钩子案例大全

所有的同步钩子只支持 tap 方法来注册 sync handler。

  ### syncHook（同步钩子）

  ```js
  const { SyncHook } = require('tapable')

  // 实例化 SyncHook
  const sh = new SyncHook(['arg1'])

  // 通过 tap 注册 handler
  sh.tap('1', function (arg1, arg2) {
      console.log(arg1, arg2, 1);
  });
  sh.tap({
    name: '2',
    before: '1',
  }, function (arg1) {
      console.log(arg1, 2);
  });
  sh.tap({
    name: '3',
    stage: -1,
  }, function (arg1) {
      console.log(arg1, 3);
  });

  // 通过 call 执行 handler
  sh.call('tapable', 'tapable-2.0.0')

  // 打印顺序如下
  tapable, 3
  tapable, 2
  tapable, undefined, 1
  ```

  1. **tap 的源码分析**

      *  先校验 options 参数的格式，再走到 _runRegisterInterceptors 方法，这一步是为了执行拦截器的 register 方法，来改变 options。
      *  接着走到 _insert 内部，内部根据 before、stage 属性来调整 handler 的顺序，并且将所有的信息保存到 taps 数组里面。
  
  2. **call 的源码分析**

      * 执行 call，就是执行了原型上的 _call，也就是执行了 createCompileDelegate，这个函数返回的是另外一个 lazyCompileHook 函数，在 lazyCompileHook 函数内部会重新赋值 call 方法，得到编译后的结果。也就是第二次调用 call的时候，其实就是执行 _createCall 方法的返回值。
      * _createCall 内部执行了 compile 方法，这个方法在 SyncHook 的原型上。compile 的内部先执行 SyncHookCodeFactory 上的 setup 方法，然后执行 create 方法。
      * setup 与 create 方法都是在 HookCodeFactory 的原型上，因为 SyncHookCodeFactory 是继承于 HookCodeFactory。
      * setup 内部的逻辑很简单，就是从 taps 数组过滤出传入的 handler。
      * create 内部先初始化 options 参数，这个是在调用 compile 的时候传入的，然后通过字符串拼接执行 new Function 得到 fn，最后执行的也是这个 fn。

  我们一般对 new Function 很陌生，所以很好奇 create 里面到底是生成了什么。可以在 new Function 打个断点，一步步 debugger 一下，最后会发现生成的 fn 是如下的函数。

  ```js
  (function anonymous(arg1) {
    // header
    "use strict";
    var _context;
    var _x = this._x;
    // content
    var _fn0 = _x[0];
    _fn0(arg1);
    var _fn1 = _x[1];
    _fn1(arg1);
    var _fn2 = _x[2];
    _fn2(arg1);
  })

  // arg1 参数，其实就是在 new Function 时候调用 this.args 生成的字符串而来的，而 this.args 是由实例化钩子传入的
  // header 块，this.header 生成的 (HookCodeFactory 原型上)
  // content 块，this.content 生成的 (这个方法会在对应的钩子工厂类的原型上重写)
  ```

  而执行 sh.call('tapable', 'tapable-2.0.0')，其实执行的就是上述的函数，那么这个库的作者处心积虑的这么做的意义何在呢，当然这个例子也看不出很大的作用，只能看到函数体内部没有 for 循环，函数的执行都是扁平的。最大的好处其实在于你看过 Async*Hook 编译出来的 fn，你就知道为啥要这么做了。

  ### SyncBailHook（同步保险钩子）

  ```js
  const sbh = new SyncBailHook(['arg1'])
  sbh.tap({ 
    context: true, 
    name: '1'
  }, function (context, arg1) {
    console.log(context, arg1, 1)
    return 1
  });
  sbh.tap({
    name: '2',
  }, function (arg1) {
    // 不会执行
    console.log(arg1, 2)
  });

  sbh.call('tapable')

  // 打印
  {}, tapable, 1
  ```

  **编译的 fn 如下**

  ```js
  (function anonymous(arg1) {
    "use strict";
      var _context = {};
      var _x = this._x;
      var _fn0 = _x[0];
      var _result0 = _fn0(_context, arg1);
      if (_result0 !== undefined) {
          return _result0;;
      } else {
          var _fn1 = _x[1];
          var _result1 = _fn1(arg1);
          if (_result1 !== undefined) {
              return _result1;;
          } else {}
      }

  })
  ```

  SyncBailHook 从字面上的意思是同步保险钩子，也就是只要前面的 handler 返回值不是 undefined，下一个 handler 就不会被触发。

  ### SyncLoopHook（同步循环钩子）

  ```js
  const slh = new SyncLoopHook()
  // 因为 handler 返回值不为 undefined，会一直循环执行
  slh.tap('1', () => {
    console.log(1)
    return 1
  })
  slh.tap('2', () => {
    console.log(2)
    return 2
  })
  slh.call()
  ```

  **编译的 fn 如下**

  ```js
  (function anonymous() {
      "use strict";
      var _context;
      var _x = this._x;
      var _loop;
      do {
          _loop = false;
          var _fn0 = _x[0];
          var _result0 = _fn0();
          if (_result0 !== undefined) {
              _loop = true;
          } else {
              var _fn1 = _x[1];
              var _result1 = _fn1();
              if (_result1 !== undefined) {
                  _loop = true;
              } else {
                  if (!_loop) {}
              }
          }
      } while ( _loop );
  })
  ```

  SyncLoopHook 从字面上的意思是同步循环钩子，也就是只要前面的 handler 返回值不是 undefined，那么会一直循环执行。
  
  ### SyncWaterfallHook（同步瀑布钩子）

  ```js
  // SyncWaterfallHook 必须传入一个长度不为 0 的数组
  const swfh = new SyncWaterfallHook(['arg'])
  swfh.tap('1', (arg) => {
    console.log(arg)
    return 1
  })
  swfh.tap('2', (arg) => {
    console.log(arg)
    return 2
  })
  swfh.call('webpack')

  // 打印如下
  webpack
  1
  ```

  **编译的 fn 如下**

  ```js
  (function anonymous(arg) {
      "use strict";
      var _context;
      var _x = this._x;
      var _fn0 = _x[0];
      var _result0 = _fn0(arg);
      if (_result0 !== undefined) {
          arg = _result0;
      }
      var _fn1 = _x[1];
      var _result1 = _fn1(arg);
      if (_result1 !== undefined) {
          arg = _result1;
      }
      return arg;
  })
  ```

  对于 SyncWaterfallHook，前面的 handler 返回值作为下一个 handler 的输入值，并且要求实例化 SyncWaterfallHook 的时候，传入非零长度的数组。call 传入的参数会作为第一个 handler 的入参。

## 异步钩子案例大全
  
  所有的异步钩子支持 tap、tapAsync、tapPromise 方法来注册各种类型的 handler，但是不支持 call 方法来触发 handler，只支持 promise、callAsync。

  ### AsyncParallelBailHook（异步并行保险钩子）

  ```js
  const apbh = new AsyncParallelBailHook()
  apbh.tapAsync('1', (next) => {
    setTimeout(() => {
      next(1)
    }, 3000)
  })
  apbh.tapAsync('2', (next) => {
    setTimeout(() => {
      next(2)
    }, 1000)
  })
  apbh.callAsync((result) => {
    console.log(result)
    console.log('callback 执行完成')
  })

  // 打印如下
  1 // 3s 后打印的
  callback 执行完成
  ```

  **编译的 fn 如下**

  ```js
  (function anonymous(_callback) {
      "use strict";
      var _context;
      var _x = this._x;
      var _results = new Array(2);
      var _checkDone = () = >{
          for (var i = 0; i < _results.length; i++) {
              var item = _results[i];
              if (item === undefined) return false;
              if (item.result !== undefined) {
                  _callback(null, item.result);
                  return true;
              }
              if (item.error) {
                  _callback(item.error);
                  return true;
              }
          }
          return false;
      }
      do {
          var _counter = 2;
          var _done = () = >{
              _callback();
          };
          if (_counter <= 0) break;
          var _fn0 = _x[0];
          _fn0((_err0, _result0) = >{
              if (_err0) {
                  if (_counter > 0) {
                      if (0 < _results.length && ((_results.length = 1), (_results[0] = {
                          error: _err0
                      }), _checkDone())) {
                          _counter = 0;
                      } else {
                          if (--_counter === 0) _done();
                      }
                  }
              } else {
                  if (_counter > 0) {
                      if (0 < _results.length && (_result0 !== undefined && (_results.length = 1), (_results[0] = {
                          result: _result0
                      }), _checkDone())) {
                          _counter = 0;
                      } else {
                          if (--_counter === 0) _done();
                      }
                  }
              }
          });
          if (_counter <= 0) break;
          if (1 >= _results.length) {
              if (--_counter === 0) _done();
          } else {
              var _fn1 = _x[1];
              _fn1((_err1, _result1) = >{
                  if (_err1) {
                      if (_counter > 0) {
                          if (1 < _results.length && ((_results.length = 2), (_results[1] = {
                              error: _err1
                          }), _checkDone())) {
                              _counter = 0;
                          } else {
                              if (--_counter === 0) _done();
                          }
                      }
                  } else {
                      if (_counter > 0) {
                          if (1 < _results.length && (_result1 !== undefined && (_results.length = 2), (_results[1] = {
                              result: _result1
                          }), _checkDone())) {
                              _counter = 0;
                          } else {
                              if (--_counter === 0) _done();
                          }
                      }
                  }
              });
          }
      } while ( false );
  })
  ```

  从 AsyncParallelBailHook 来看，每个 handler 的最后一位形参是 next，它是一个函数，用户必须手动执行并且传参，这样 callback 会拿到该参数并且执行。从例子可以看出，callback 的执行是取决于注册的 handler 的顺序，虽然 next(2) 是在 1s 后就执行了，但是还是不会触发 callback，而是 next(1) 触发了 callback。

  ### AsyncParallelHook（异步并行钩子）

  ```js
  const apl = new AsyncParallelHook()

  apl.tapAsync('1', (next) => {
    setTimeout(() => {
      next(1)
    }, 3000)
  })
  apl.tapAsync('2', (next) => {
    setTimeout(() => {
      next(2)
    }, 1000)
  })
  apl.callAsync((result) => {
    console.log(result)
    console.log('callback 执行完成')
  })

  // 打印如下
  2 // 1s 后打印的
  callback 执行完成
  ```

  **编译的 fn 如下**

  ```js
  (function anonymous(_callback) {
      "use strict";
      var _context;
      var _x = this._x;
      do {
          var _counter = 2;
          var _done = () = >{
              _callback();
          };
          if (_counter <= 0) break;
          var _fn0 = _x[0];
          _fn0(_err0 = >{
              if (_err0) {
                  if (_counter > 0) {
                      _callback(_err0);
                      _counter = 0;
                  }
              } else {
                  if (--_counter === 0) _done();
              }
          });
          if (_counter <= 0) break;
          var _fn1 = _x[1];
          _fn1(_err1 = >{
              if (_err1) {
                  if (_counter > 0) {
                      _callback(_err1);
                      _counter = 0;
                  }
              } else {
                  if (--_counter === 0) _done();
              }
          });
      } while ( false );
  })
  ```

  从 AsyncParallelHook 来看，每个 handler 的最后一位形参是 next，它是一个函数，用户必须手动执行并且传参，这样 callback 会拿到该参数并且执行。从例子可以看出，callback 的执行是取决执行 next 函数的快慢。

  ### AsyncSeriesBailHook（异步串行保险钩子）

  ```js
  const asbh = new AsyncSeriesBailHook()

  asbh.tapPromise('1', () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(1)
      }, 3000)
    })
  })
  asbh.tapPromise('2', () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(2)
      })
    })
  })
  asbh.promise().then((res) => {
    console.log(res)
  })

  // 打印如下
  1 // 3s 后打印的
  ```

  **编译的 fn 如下**

  ```js
  (function anonymous() {
      "use strict";
      return new Promise((_resolve, _reject) = >{
          var _sync = true;
          var _context;
          var _x = this._x;
          var _fn0 = _x[0];
          var _hasResult0 = false;
          var _promise0 = _fn0();
          if (!_promise0 || !_promise0.then) throw new Error('Tap function (tapPromise) did not return promise (returned ' + _promise0 + ')');
          _promise0.then(_result0 = >{
              _hasResult0 = true;
              if (_result0 !== undefined) {
                  _resolve(_result0);;
              } else {
                  var _fn1 = _x[1];
                  var _hasResult1 = false;
                  var _promise1 = _fn1();
                  if (!_promise1 || !_promise1.then) throw new Error('Tap function (tapPromise) did not return promise (returned ' + _promise1 + ')');
                  _promise1.then(_result1 = >{
                      _hasResult1 = true;
                      if (_result1 !== undefined) {
                          _resolve(_result1);;
                      } else {
                          _resolve();
                      }
                  },
                  _err1 = >{
                      if (_hasResult1) throw _err1;
                      if (_sync) _resolve(Promise.resolve().then(() = >{
                          throw _err1;
                      }));
                      else _reject(_err1);
                  });
              }
          },
          _err0 = >{
              if (_hasResult0) throw _err0;
              if (_sync) _resolve(Promise.resolve().then(() = >{
                  throw _err0;
              }));
              else _reject(_err0);
          });
          _sync = false;
      });

  })
  ```

  我们用 tapPromise 方法做了个测试，handler 必须返回一个 Promise，而且 AsyncSeriesBailHook 钩子的 promise 方法返回的是一个 Promise，then 里面的回调函数的参数与注册的 handler 返回的 Promise 有关。

  ### AsyncSeriesHook（异步串行钩子）

  ```js
  const ash = new AsyncSeriesHook()

  ash.tapAsync('1', (next) => {
    console.log(1)
    next()
  })
  ash.tapAsync('2', (next) => {
    console.log(2)
    next('触发 callback')
  })
  ash.callAsync(function callback () {
    console.log('callback 执行完了')
  })

  // 打印如下
  1
  2
  callback 执行完了
  ```

  **编译的 fn 如下**

  ```js
  (function anonymous(_callback) {
      "use strict";
      var _context;
      var _x = this._x;
      var _fn0 = _x[0];
      _fn0(_err0 = >{
          if (_err0) {
              _callback(_err0);
          } else {
              var _fn1 = _x[1];
              _fn1(_err1 = >{
                  if (_err1) {
                      _callback(_err1);
                  } else {
                      _callback();
                  }
              });
          }
      });
  })
  ```

  串行执行 handler，handler 参数的最后一个是 next 函数，必须手动执行，才会走到下面的逻辑。callback 的执行是根据 next是否传参决定的。由之前的 [tapbale-0.2.8源码分析](http://localhost:8080/blog/code/webpack/source-code-prepare/tapable-0.2.html)来看，**之前为了实现异步的钩子，都需要函数内部有个递归调用的过程，现在编译之后，所有的逻辑都扁平化了，不会引起递归占用过多的空间的问题。这也是重构的好处。** 

  ### AsyncSeriesWaterfallHook（异步串行瀑布钩子）

  ```js
  const ash = new AsyncSeriesWaterfallHook(['name'])

  ash.tapAsync('1', (name, next) => {
    console.log(name)
    next(null, '来自 handler 1 的参数')
  })
  ash.tapAsync('2', (name, next) => {
    console.log(name)
    next(null, '来自 handler 2 的参数')
  })
  ash.callAsync('来自初始化的参数', (err, name) => {
    console.log(name)
  })

  // 打印如下
  来自初始化的参数
  来自 handler 1 的参数
  来自 handler 2 的参数
  ```

  **编译的 fn 如下**

  ```js
  (function anonymous(name, _callback) {
      "use strict";
      var _context;
      var _x = this._x;
      var _fn0 = _x[0];
      _fn0(name, (_err0, _result0) = >{
          if (_err0) {
              _callback(_err0);
          } else {
              if (_result0 !== undefined) {
                  name = _result0;
              }
              var _fn1 = _x[1];
              _fn1(name, (_err1, _result1) = >{
                  if (_err1) {
                      _callback(_err1);
                  } else {
                      if (_result1 !== undefined) {
                          name = _result1;
                      }
                      _callback(null, name);
                  }
              });
          }
      });
  })
  ```

  异步串行执行 handler，handler 参数的最后一个是 next 函数，必须手动执行，才会走到下面的逻辑。callback 的执行是根据 next是否传参决定的。第一个参数是 error，第二个参数是传给下一个 handler 的值，如果 error 存在的话，直接会执行 callback。

## 同异步钩子类的总结

分析了所有的同异步钩子，那么 HookMap, MutilHook 的逻辑就更清晰了，这边就不分析了。根据之前的 tapable 版本，牵涉到异步执行的钩子，韩式内部肯定是存在递归的，这样写起来容易让人看懂。然而 2.0.0-beta 版本采用字符串拼接的方法把这些递归给抹平了，而且还会缓存每次编译的生成的 fn。这样来说，空间占用就变少了，性能更好了。