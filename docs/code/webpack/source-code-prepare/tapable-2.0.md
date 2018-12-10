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
  Tapable  |  向前兼容老版本  |