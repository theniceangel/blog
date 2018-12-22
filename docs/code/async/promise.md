# 怎样实现 Promise

大多数人都使用过 Promise，觉得扁平化的链式调用解决了 “Callback Hell” 的问题，但是很多人却不理解为啥能实现异步，背后的源码到底是怎么实现的。所以在阅读了网上大量资料之后，尝试着手写一个 JPromise 来加深对 Promise 的理解。