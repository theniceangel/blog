# Vue 性能优化之深挖数组
---

## 背景

最近在用 Vue 重构一个历史项目，一个考试系统，题目量很大，所以核心组件的性能成为了关注点。先来两张图看下最核心的组件 Paper 的样式。

<img :src="$withBase('/assets/vue-array-optimize-1.png')" width="30%" alt="vue-array-optimize-1">

<img :src="$withBase('/assets/vue-array-optimize-2.png')" width="30%" alt="vue-array-optimize-1">

从图中来看，分为答题区与选择面板区。

稍微对交互逻辑进行下拆解：

*  答题模式与学习模式可以相互切换，控制正确答案显隐。
*  单选与判断题直接点击就记录答案正确性，多选是选择答案之后点击确定才能记录正确性。
*  选择面板则是记录做过的题目的情况，分为六种状态（未做过的，未做过且当前选择的，做错的，做错的且当前选择的，做对的，做对的且当前选择的），用不同的样式去区别。
*  点击选择面板，答题区能切到对应的题号。

基于以上考虑，我觉得我必须有三个响应式的数据：

*  `currentIndex`： 当前选中题目的序号。
*  `questions`：所有题目的信息，是个数组，里面维护了每道题的问题、选项、正确与否等信息。
*  `cardData`：题目分组的信息，也是个数组，按章节名称对不同的题目进行了分类。

数组每一项数据结构如下：

```js
currentIndex = 0 // 用来标记当前选中题目的索引

questions = [{
    secId: 1, // 所属章节的 id
    tid: 1, // 题目 id
    content: '题目内容' // 题目描述
    type: 1, // 题型，1 ~ 3 (单选，多选，判断)
    options: ['选项1', '选项2', '选项3', '选项4',] // 每个选项的描述
    choose: [1, 2, 4], // 多选——记录用户未提交前的选项
    done: true, // 标记当前题目是否已做
    answerIsTrue: undefined // 标记当前题目的正确与否
}]

cardData = [{
    startIndex: 0, // 用来记录循环该分组数据的起始索引，这个值等于前面数据的长度累加。
    secName: '章节名称',
    secId: '章节id',
    tids: [1, 2, 3, 11] // 该章节下面的所有题目的 id
}]
```

由于题目可以左右滑动切换，所以我每次从 `questions` 取了三个数据去渲染，用的是 [cube-ui](https://github.com/didi/cube-ui) 的 Slide 组件，只要自己根据 this.currentIndex 结合 computed 特性去动态的切割三个数据就行。

这一切都显得很美好，尤其是即将结束了一个历史项目的核心组件的编写之前，心情特别的舒畅。

**然而转折点出现在了渲染选择面板样式这一步**

代码逻辑很简单，但是发生了让我懵逼的事情。

```html
<div class="card-content">
  <div class="block" v-for="item in cardData" :key="item.secName">
    <div class="sub-title">{{item.secName}}</div>
    <div class="group">
      <span
        @click="cardClick(index + item.startIndex)"
        class="item"
        :class="getItemClass(index + item.startIndex)"
        v-for="(subItem, index) in item.secTids"
        :key="subItem">{{index + item.startIndex + 1}}</span>
    </div>
  </div>
</div>
```

其实就是利用 cardData 去生成 DOM 元素，这是个分组数据（先是以章节为维度，章节下面还有对应的题目），上面的代码其实是一个循环里面嵌套了另一个循环。

**但是，只要我切换题目或者点击面板，抑或是触发任意响应式数据的改变，都会让页面卡死！！**

## 探索

当下的第一反应，肯定是 js 在某一步的执行时间过长，所以利用 Chrome 自带的 Performance 工具 追踪了一下，发现问题出在 `getItemClass` 这个函数调用，占据了 99% 的时间，而且时间都超过 1s 了。瞅了眼自己的代码：

```js
getItemClass (index) {
  const ret = {}
  // 如果是做对的题目,但并不是当前选中
  ret['item_true'] = this.questions[index]......
  // 如果是做对的题目，并且是当前选中
  ret['item_true_active'] = this.questions[index]......
  // 如果是做错的题目,但并不是当前选中
  ret['item_false'] = this.questions[index]......
  // 如果是做错的题目，并且是当前选中
  ret['item_false_active'] = this.questions[index]......
  // 如果是未做的题目，但不是当前选中
  ret['item_undo'] = this.questions[index]......
  // 如果是未做的题目，并且是当前选中
  ret['item_undo_active'] = this.questions[index]......
  return ret
},
```

这个函数主要是用来计算选择面板每一个小圆圈该有的样式。每一步都是对 questions 进行了 getter 操作。初看，好像没什么问题，但是由于之前看过 Vue 的源码，细想之下，觉得不对。

首先，webpack 会将 .vue 文件的 template 转换成 render 函数，也就是实例化组件的时候，其实是对响应式属性求值的过程，这样响应式属性就能将 renderWatcher 加入依赖当中，所以当响应式属性改变的时候，能触发组件重新渲染。

我们先来了解下 renderWatcher 是什么概念，首先在 Vue 的源码里面是有三种 watcher 的。我们只看 renderWatcher 的定义。

```js
// 位于 vue/src/core/instance/lifecycle.js
new Watcher(vm, updateComponent, noop, {
    before () {
      if (vm._isMounted) {
        callHook(vm, 'beforeUpdate')
      }
    }
}, true /* isRenderWatcher */)

updateComponent = () => {
  vm._update(vm._render(), hydrating)
}

// 位于 vue/src/core/instance/render.js
Vue.prototype._render = function (): VNode {
    ......
    
    const { render, _parentVnode } = vm.$options
    try {
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      ......
    }
    return vnode
}
```

稍微分析下流程：实例化 Vue 实例的时候会走到 $mount，即走到上述的 new Watcher，这个就是 renderWatcher，之后走到 updateComponent 函数，也就是会执行 _render，函数内部会通过 vm.$options 取到由 template 编译生成的 render 函数，进而执行 renderWatcher 收集依赖。_render 返回的是组件的 vnode，传入 _update 函数从而执行组件的 patch，最终生成视图。

其次，从我写的 template 来分析，为了渲染选择面板的 DOM，是有两层 for 循环的，内部每次循环都会执行 getItemClass 函数，而函数的内部又是对 questions 这个响应式数组进行了 getter 求值，从目前来看，时间复杂度是 O(n²)，如上图所示，我们大概有 2000 多道题目，我们假设有 10 个章节，每个章节有 200 道题目，getItemClass 内部是对 questions 进行了 6 次求值，这样一算，粗略也是 12000 左右，按 js 的执行速度，是不可能这么慢的。

**那么问题是不是出现在对 questions 进行 getter 的过程中，出现了 O(n³) 的复杂度呢？**

于是，我打开了 Vue 的源码，由于之前深入研究过源码，所以轻车熟路地找到了 `vue/src/core/instance/state.js` 里面将 data 转换成 getter/setter 的部分。

```js
function initData (vm: Component) {
  ......
  // observe data
  observe(data, true /* asRootData */)
}
```

定义一个组件的 data 的响应式，都是从 observe 函数开始，它的定义是位于 `vue/src/core/observer/index.js`。

```js
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}
```

observe 函数接受对象或者数组，内部会实例化 Observer 类。

```js
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number;
  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}
```

Observer 的构造函数很简单，就是声明了 dep、value 属性，并且将 value 的 \__ob__ 属性指向当前实例。举个栗子：

```js
// 刚开始的 options 
export default {
    data : {
        msg: '消息',
        arr: [1],
        item: {
            text: '文本'
        }
    }
}
// 实例化 vm 的时候，变成了以下
data: {
    msg: '消息',
    arr: [1, __ob__: {
            value: ...,
            dep: new Dep(),
            vmCount: ...
        }],
    item: {
        text: '文本',
        __ob__: {
            value: ...,
            dep: new Dep(),
            vmCount: ...
        }
    },
    __ob__: {
        value: ...,
        dep: new Dep(),
        vmCount: ...
    }
}
```

也就是每个对象或者数组被 observe 之后，多了一个 \__ob__ 属性，它是 Observer 的实例。那么这么做的意义何在呢，稍后分析。

继续分析 Observer 构造函数的下面部分：

```js
// 如果是数组，先篡改数组的一些方法(push,splice,shift等等)，使其能够支持响应式
if (Array.isArray(value)) {
  if (hasProto) {
    protoAugment(value, arrayMethods)
  } else {
    copyAugment(value, arrayMethods, arrayKeys)
  }
  // 数组里面的元素还是数组或者对象，递归地调用 observe 函数，使其成为响应式数据
  this.observeArray(value)
} else {
  // 遍历对象，使其每个键值也能成为响应式数据    
  this.walk(value)
}
walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      // 将对象的键值转换成 getter / setter，
      // getter 收集依赖
      // setter 通知 watcher 更新
      defineReactive(obj, keys[i])
    }
}
observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
}
```

我们再捋一下思路，首先在 initState 里面调用 initData，initData 得到用户配置的 data 对象后调用了 observe，observe 函数里面会实例化 Observer 类，在其构造函数里面，首先将对象的 \__ob__ 属性指向 Observer 实例（这一步是为了检测到对象添加或者删除属性之后，能触发响应式的伏笔），之后遍历当前对象的键值，调用 defineReactive 去转换成 getter / setter。

所以，来分析下 defineReactive。

```js
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 每个属性收集 watcher 的管理器    
  const dep = new Dep()
  ......    
  // 递归地去将属性值变成响应式    
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        // 当前属性收集 watcher
        dep.depend() // 语句1
        if (childOb) {
          // 如果当前属性对应的属性值是对象，将当前 watcher 加入 val.__ob__.dep当中去，为什么要这么做呢？先思考一下
          childOb.dep.depend() // 语句2
          // 如果当前属性对应的属性值是数组，递归地将当前 watcher 加入数组每一项，item.__ob__.dep当中去,为什么要这么做呢？
          if (Array.isArray(value)) { // 语句3
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      .....    
      childOb = !shallow && observe(newVal)
      dep.notify()
    }
  })
}

function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
```

首先，我们从 defineReactive 可以看出，每个响应式属性都有一个 Dep 实例，这个是用来收集 watcher 的。由于 getter 与 setter 都是函数，并且引用了 dep，所以形成了闭包，dep 一直存在于内存当中。因此，假如在渲染组件的时候，如果使用了响应式属性 a，就会走到上述的语句1，dep 实例就会收集组件这个 renderWatcher，因为在对 a 进行 setter 赋值操作的时候，会调用 dep.notify() 去 通知 renderWatcher 去更新，进而触发响应式数据收集新一轮的 watcher。

**那么语句2与3，到底是什么作用呢**

我们举个栗子分析

```html
<div>{{person}}<div>
```

```js
export default {
  data () {
    return {
      person: {
        name: '张三',
        age: 18
      }        
    }
  }
}

this.person.gender = '男' // 组件视图不会更新
```

因为 Vue 是无法探测到对象增添属性，所以也没有一个时机去触发 renderWatcher 的更新。

为此, Vue 提供了一个 API，`this.$set`，它是 `Vue.set` 的别名。

```js
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}
```

set 函数接受三个参数，第一个参数可以是 Object 或者 Array，其余的参数分别为 key, value。如果利用这个 API 给 person 增加一个属性呢？

```js
this.$set(this.person, 'gender', '男') // 组件视图重新渲染
```

为什么通过 set 函数又能触发重新渲染呢？注意到这一句, `ob.dep.notify()`，`ob`怎么来的呢，那就得回到之前的 observe 函数了，其实 data 经过 observe 处理之后变成下面这样。

```js
{
  person: {
    name: '张三',
    age: 18,
    __ob__: {
      value: ...,
      dep: new Dep()
    }
  },
  __ob__: {
    value: ...,
    dep: new Dep()
  }
}
// 只要是对象，都定义了 __ob__ 属性，它是 Observer 类的实例
```


从 template 来看，视图依赖了 person 这个属性值，renderWatcher 被收集到了 person 属性的 Dep 实例当中，对应 `defineReactive` 函数定义的**语句1**，同时，**语句2**的作用就是将 renderWatcher 收集到 person.\__ob__.dep 当中去，因此在给 person 增加属性的时候，调用 set 方法才能获取到 person.\__ob__.dep，进而触发 renderWatcher 更新。

**那么得出结论，语句2的作用是为了能够探测到响应式数据是对象的情况下增删属性而引发重新渲染的。**

再举个栗子解释下**语句3**的作用。

```html
<div>{{books}}<div>
```

```js
export default {
  data () {
    return {
      books: [
        {
          id: 1,
          name: 'js'
        }
      ]       
    }
  }
}
```

因为组件对 books 进行求值，而它是一个数组，所以会走到语句3的逻辑。

```js
if (Array.isArray(value)) { // 语句3
    dependArray(value)
}

function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
```

从逻辑上来看，就是循环 books 的每一项 item，如果 item 是一个数组或者对象，就会获取到 item.\__ob__.dep，并且将当前 renderWatcher 收集到 dep 当中去。

如果没有这一句，会发生什么情况？考虑下如下的情况：

```js
this.$set(this.books[0], 'comment', '棒极了') // 并不会触发组件更新
```

如果理解成 renderWatch 并没有对 this.books[0] 进行求值，所以改变它并不需要造成组件更新，那么这个理解是有误的。正确的是因为数组是元素的集合，内部的任何修改是需要反映出来的，所以语句3就是为了在 renderWatcher 对数组求值的时候，将 renderWatcher 收集到数组内部每一项 item.\__ob__.dep 当中去，这样只要内部发生变化，就能通过 dep 获取到 renderWatcher，通知它更新。

那么结合我的业务代码，就分析出来问题出现在语句3当中。

```html
<div class="card-content">
  <div class="block" v-for="item in cardData" :key="item.secName">
    <div class="sub-title">{{item.secName}}</div>
    <div class="group">
      <span
        @click="cardClick(index + item.startIndex)"
        class="item"
        :class="getItemClass(index + item.startIndex)"
        v-for="(subItem, index) in item.secTids"
        :key="subItem">{{index + item.startIndex + 1}}</span>
    </div>
  </div>
</div>
```

```js
getItemClass (index) {
  const ret = {}
  // 如果是做对的题目,但并不是当前选中
  ret['item_true'] = this.questions[index]......
  // 如果是做对的题目，并且是当前选中
  ret['item_true_active'] = this.questions[index]......
  // 如果是做错的题目,但并不是当前选中
  ret['item_false'] = this.questions[index]......
  // 如果是做错的题目，并且是当前选中
  ret['item_false_active'] = this.questions[index]......
  // 如果是未做的题目，但不是当前选中
  ret['item_undo'] = this.questions[index]......
  // 如果是未做的题目，并且是当前选中
  ret['item_undo_active'] = this.questions[index]......
  return ret
},
```

首先 `cardData` 是一个分组数据，循环里面套循环，假设有 10 个章节， 每个章节有 200 道题目，那么其实会执行 2000 次 getItemClass 函数，getItemClass 内部会有 6 次对 questions 进行求值，每次都会走到 dependArray，每次执行 dependArray 都会循环 2000 次，所以粗略估计 2000 * 6 * 2000 = 2400 万次，如果假设一次执行的语句是 4 条，那么也会执行接近一亿次的语句，性能自然是原地爆炸！

既然从源头分析出了原因，那么就要找出方法从源头上去解决。

1. 拆分组件

   很多人理解拆分组件是为了复用，当然作用不止是这些，拆分组件更多的是为了可维护性，可以更语义化，在同事看到你的组件名的时候，大概能猜出里面的功能。而我这里拆分组件，是为了隔离无关的响应式数据造成的组件渲染。从上图可以看出，只要任何一个响应式数据改变，Paper 都会重新渲染，比如我点击收藏按钮，Paper 组件会重新渲染，按道理只要收藏按钮这个 DOM 重新渲染即可。

2. 在嵌套循环中，不要用函数

   性能出现问题的原因是在于我用了 getItemClass 去计算每一个小圆圈的样式，而且在函数里面还对 questions 进行了求值，这样时间复杂度从 O(n²) 变成了 O(n³)(由于源码的 dependArray也会循环)。最后的解决方案，我是弃用了 getItemClass 这个函数，直接更改了 cardData 的 tids 的数据结构，变成了 tInfo，也就是在构造数据的时候，计算好样式。

	```js
	this.cardData = [{
	    startIndex: 0,
	    secName: '章节名称',
	    secId: '章节id',
	    tInfo: [
	    {
	        id: 1,
	        klass: 'item_false'
	    }, 
	    {
	        id: 2,
	        klass: 'item_false_active'
	    }]
	}]
	```
	
	如此一来，就不会出现 O(n³) 时间复杂度的问题了。

3. 善用缓存

   我发现 getItemClass 里面自己写的很不好，其实应该用个变量去缓存 quesions，这样就不会造成对 questions 多次求值，进而多次走到源码的 dependArray 当中去。

	```js
	const questions = this.questions
	
	// good           // bad
	// questions[0]   this.questions[0] 
	// questions[1]   this.questions[1]
	// questions[2]   this.questions[2]
	......
	
	// 前者只会对 this.questions 一次求值，后者会三次求值
	```

## 后感

从这次教训，自己也学到了也很多。

- 遇到问题的时候，要利用现有工具去分析问题的原因，比如 Chrome 自带的 Performance。
- 对于自己所用的技术，要追根究底，庆幸自己之前深入研究过 Vue 的源码，这样才能游刃有余地去解决问题，否则现在估计还一头雾水，如果有想深入理解 Vue 的小伙伴，可以参考[Vue.js 技术揭秘](https://ustbhuangyi.github.io/vue-analysis/)，看过 GitHub 上面很多源码分析，这个应该是写的最全最好的，我自己也对该源码分析提过 PR。如果自学吃力的情况下，可以考虑[配套视频](https://coding.imooc.com/class/228.html)，毕竟用知识武装自己，在 IT 界永不吃亏。
- 实现一个需求很容易，但是要把性能做到最佳，成本可能急剧增加。