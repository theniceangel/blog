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
  Hook   | `tap`， `tapAsync`，`tapPromise` | 钩子基类。
  SyncHook   | `tap` | 同步钩子。
  SyncBailHook   | `tap` | 同步钩子，只要执行的 handler 有返回值，剩余 handler 不执行。
  SyncLoopHook   | `tap` | 同步钩子，只要执行的 handler 有返回值，一直循环执行此 handler。
  SyncWaterfallHook  | `tap` | 同步钩子，上一个 handler 的返回值作为下一个 handler 的输入值。
  AsyncParallelBailHook  | `tap` | 同步钩子，上一个 handler 的返回值作为下一个 handler 的输入值。
  AsyncParallelHook  | `tap` | 同步钩子，上一个 handler 的返回值作为下一个 handler 的输入值。
  AsyncSeriesBailHook  | `tap` | 同步钩子，上一个 handler 的返回值作为下一个 handler 的输入值。
  AsyncSeriesHook  | `tap` | 同步钩子，上一个 handler 的返回值作为下一个 handler 的输入值。
  AsyncSeriesLoopHook  | `tap` | 同步钩子，上一个 handler 的返回值作为下一个 handler 的输入值。
  AsyncSeriesWaterfallHook  | `tap` | 同步钩子，上一个 handler 的返回值作为下一个 handler 的输入值。

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

    根据实例化 SyncHook 传入的参数以逗号拼接形参字符串。支持 before 与 after 属性，能够在字符串的头部或者尾部插入对应的属性值字符串。比如 new SyncHook(['arg1', 'arg2'])，那么经过 this.args 处理后，就变成 "arg1, arg2"。再通过 fn = new Function("arg1, arg2") 之后，就变成 fn 接收 arg1 与 arg2两个形参了。假如你在使用 call 方法的时候传入三个参数，那么第三个参数就获取不到了，因为 fn 只支持两个参数。


