module.exports = {
  title: 'JiZhi',
  base: '/blog/',
  head: [],
  description: '每天都是充实的一天。',
  themeConfig: {
    nav: [
      { 
        text: '编程', 
        link: '/code/vue/vuex',
        items: []
      },
      { 
        text: '书籍', 
        link: '/books/literature/lostParadise',
        items: []
      },
      { 
        text: '文章', 
        link: '/articles/index',
        items: []
      },
      { 
        text: '资源', 
        link: '/sources/index',
        items: []
      },
      { 
        text: 'Github', 
        link: 'https://github.com/theniceangel',
        items: []
      }
    ],
    sidebar: {
      '/code/' : [
        {
          title: '软件素养',
          collapsable: false,
          children: [
            'software/uml-class-design.md'
          ]
        },
        {
          title: 'Vue',
          collapsable: false,
          children: [
            'vue/vuex.md',
            'vue/vue-router.md',
            'vue/vue-array-optimize.md'
          ]
        },
        {
          title: '异步编程',
          collapsable: false,
          children: [
            'async/co.md'
          ]
        },
        {
          title: 'webpack 源码之准备篇',
          collapsable: false,
          children: [
            'webpack/source-code-prepare/tapable-0.2.md',
            'webpack/source-code-prepare/tapable-2.0.md'
          ]
        },
        {
          title: 'webpack 源码之分析篇',
          collapsable: false,
          children: [
            'webpack/source-code/init.md'
          ]
        }
      ],
      '/books/' : [
        {
          title: '文学',
          collapsable: false,
          children: [
            'literature/lostParadise'
          ]
        }
      ]
    }
  }
}