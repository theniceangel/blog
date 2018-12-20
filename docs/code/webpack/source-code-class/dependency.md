# Dependency 及其衍生类

Dependency 在 webpack 的内部是非常重要的概念，它是生成 Module 的关键。在 webpack 的构建过程中，Dependency会找到对应的 ModuleFactory，不同的 ModuleFactory 通过 create 方法生成不同的 Module。也就是如下的关系：

<img :src="$withBase('/assets/webpack/dfm-relationship.png')" width="100%">

再看下 webpack 里面的 Dependency 及其衍生类。

<img :src="$withBase('/assets/webpack/webpack-dependency.png')" width="100%">