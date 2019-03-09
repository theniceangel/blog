## 二叉树

<img :src="$withBase('/assets/full_binary_tree.gif')"  width="50%">

### 聊一聊二叉树的遍历

二叉树有**深度遍历**和**广度遍历**， 深度遍历有**前序**、 **中序**和**后序**三种遍历方法。二叉树的前序遍历可以用来显示目录结构等；中序遍历可以实现表达式树，在编译器底层很有用；后序遍历可以用来实现计算目录内的文件及其信息等。

### 深度遍历

  1. 先序遍历（递归版）

  ```js
  let ret = []
  let dfs = function (node) {
    if (node) {
      ret.push(node.val)
      dfs(node.left)
      dfs(node.right)
    }
  }
  console.log(ret) // 1,2,4,5,3,6,7
  ```

  2.先序遍历（栈）

  ```js
  let dfs = function (node) {
    let stack = [node]
    let ret = []
    while (stack.length) {
      let pop = stack.pop()
      ret.push(pop.val)
      pop.right && stack.push(pop.right) // 先压右树
      pop.left && stack.push(pop.left) // 再压左树
    }
    return ret
  }
  ```

  3.中序遍历（递归版）

  ```js
  let ret = []
  let dfs = function (node) {
    if (node) {
      dfs(node.left)
      ret.push(node.val)
      dfs(node.right)
    }
    return ret
  }
  console.log(ret) // 4,2,5,1,6,3,7
  ```

  4.中序遍历（栈）

  ```js
  let dfs = function (node) {
    let stack = []
    let ret = []
    while (stack.length || node) {
      if (node) {
        stack.push(node)
        node = node.left
      } else {
        node = stack.pop()
        ret.push(node.val)
        node = node.right
      }
    }
    return ret
  }
  ```

  5.后序遍历（递归版）

  ```js
  let ret = []
  let dfs = function (node) {
    if (node) {
      dfs(node.left)
      dfs(node.right)
      ret.push(node.val)
    }
  }
  console.log(ret) // 4,2,5,6,3,7,1
  ```

### 广度遍历

  1.递归

  ```js
  let ret = []
  let stack = [node]
  let count = 0
  let bfs = function () {
    let node = stack[count]
    if (node) {
      ret.push(node.val)
      if (node.left) {
        stack.push(node.left)
      }
      if (node.right) {
        stack.push(node.left)
      }
      count ++
      bfs()
    }
  }
  ```

  2.非递归

  ```js
  let ret = []
  let stack = [node]
  let cursor = 0
  let bfs = function () {
    while (cursor < stack.length) {
      let node = stack[cursor++]
      ret.push(node.value);
      node.left && stack.push(node.left);
      node.right && stack.push(node.right);
    }
  }
  ```