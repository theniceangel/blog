# 扁平化多维数组的不同实现方式

## 普通递归

```js
const flatten = (arr) => {
  let ret = []

  const recursive = (iterable) => {
    iterable.forEach((item) => {
      if (Array.isArray(item)) {
        recursive(item)
      } else {
        ret.push(item)
      }
    })
  }

  recursive(arr)
  return ret
}
flatten([1,[2,[3,[5]]]]) // [1, 2, 3, 5]
```

## reduce 递归调用

```js
const flatten = (arr) => {
  return arr.reduce((cur, prev) => {
    return Array.isArray(prev) ? cur.concat(flatten(prev)) : cur.concat(prev)
  }, [])
}
flatten([1,[2,[3,[5]]]]) // [1, 2, 3, 5]
```