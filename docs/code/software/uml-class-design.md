# UML 之类图

最近在学习 webpack 4.x 的源码，发现内部的实现是非常复杂，但是由于自己非科班出身，大学也没有接触过软件设计这方面的知识，所以补了下这方面，对于阅读源码来说，画出 UML 类图与程序流程图是很关键的。先从 UML 类图开始。

> 类封装了数据和行为，它是具有相同属性、操作和关系的对象集合的总称。

## 类的组成

<img :src="$withBase('/assets/software/class.png')" width="100%" alt="tapable-2.0.0.list">

*  类名：类的名字
*  属性：类的成员变量
*  操作：类的成员方法

属性表示方法如下：

> 可见性 名称:类型[=缺省值]

*  public、private和protected，在类图中分别用+、-和#表示。
*  名称：属性的名称
*  类型：属性的数据类型，可以是基本数据类型，也可以是用户自定义的类型。
*  缺省值：可选项，表示属性的初始值。

## 类图中类的相互关系

**1. 关联**

> 关联是一种结构化关系，用于表示一类对象与另一类对象之间有联系。

在UML类图中，用实线连接有关联关系的对象所对应的类。

**1.1 双向关联**

<img :src="$withBase('/assets/software/Association-two-way.png')" width="100%" alt="tapable-2.0.0.list">

**1.2 单向关联**

<img :src="$withBase('/assets/software/Association-one-way.png')" width="100%" alt="tapable-2.0.0.list">

**1.3 自关联**

<img :src="$withBase('/assets/software/Association-self.png')" width="100%" alt="tapable-2.0.0.list">

**1.4 多重关联**

<img :src="$withBase('/assets/software/Association-multi-way.png')" width="100%" alt="tapable-2.0.0.list">

**2. 聚合/组合**

**2.1 聚合**

> 聚合表示整体和部分关系，在聚合关系中成员对象是整体的对象的部分，但是成员对象可以脱离整体对象独立存在。

在UML中，聚合关系用带空心菱形的直线表示，如下图所示：

<img :src="$withBase('/assets/software/combination1.png')" width="100%" alt="tapable-2.0.0.list">

在代码实现聚合关系时，成员对象通常作为构造方法、Setter方法或业务方法的参数注入到整体对象中，如下所示：

```java
public class Car 
{  
    private Engine engine;  

    //构造注入  
    public Car(Engine engine) 
    {  
        this.engine = engine;  
    }  

    //设值注入  
    public void setEngine(Engine engine) 
    {  
        this.engine = engine;  
    }  

}  

public class Engine 
{  
    ……  
}  
```

**2.2 组合**

> 组合关系也表示整体和部分的关系，但是在组合关系汇总整体对象可以控制成员对象的生命周期，一旦整体对象不存咋了，成员对象也将不存在。

在UML中，组合关系用带实心菱形的直线表示，如下图所示：

<img :src="$withBase('/assets/software/combination2.png')" width="100%" alt="tapable-2.0.0.list">

在代码实现组合关系时，通常在整体类的构造方法中直接实例化成员类，如下所示：

```java
public class Head 
{  
    private Mouth mouth;  

    public Head() 
    {  
        mouth = new Mouth(); //实例化成员类  
    }  
}  

public class Mouth 
{  
    ……  
}  
```

**3 依赖**

> 依赖关系是一种使用关系，依赖关系通常体现在某个类的方法使用另一个类的对象作为参数。

在UML中，依赖关系用带箭头的虚线表示，由依赖的一方指向被依赖的一方，如下图所示：

<img :src="$withBase('/assets/software/depend.png')" width="100%" alt="tapable-2.0.0.list">

```java
public class Driver 
{  
    public void drive(Car car) 
    {  
        car.move();  
    }    
}  

public class Car 
{  
    public void move() 
    {  
        ……  
    }    
}  
```

**4 继承**

> 继承关系用来描述父类与子类自检的关系。

在UML中，泛化关系用带空心三角形的直线来表示，如下图所示：

<img :src="$withBase('/assets/software/inheritance.png')" width="100%" alt="tapable-2.0.0.list">

```java
//父类  
public class Person 
{  
    protected String name;  
    protected int age;  

    public void move()
    {  
        ……  
    }  

    public void say() 
    {  
        ……  
    }  
}  

//子类  
public class Student extends Person 
{  
    private String studentNo;  

    public void study() 
    {  
        ……  
    }  
}  

//子类  
public class Teacher extends Person 
{  
    private String teacherNo;  

    public void teach()
    {  
        ……  
    }  
}
```

**4 接口**

> 接口之间也可以有像类之间关系那样的继承关系和依赖关系，但是接口和类之间还存在着一种实现关系。在实现关系中，类实现了接口中定义的所有操作。

在UML中，类与接口之间的实现关系用带空心三角形的虚线来表示，如下图所示：

<img :src="$withBase('/assets/software/inheritance.png')" width="100%" alt="tapable-2.0.0.list">

```java
public interface Vehicle 
{  
    public void move();  
}  

public class Ship implements Vehicle
{  
    public void move()
    {  
        …… 
    }  
}  

public class Car implements Vehicle 
{  
    public void move()
    {  
        ……  
    }  
}
```

[原文地址](https://blog.csdn.net/AllenWells/article/details/47398091 )。手动敲了一遍，大概理解了 UML 类图，这样就能愉快地继续 webpack 的源码阅读了，准备用 [process on](https://www.processon.com/diagrams) 来画类图咯。