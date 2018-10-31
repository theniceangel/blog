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
        text: 'Github', 
        link: 'https://github.com/theniceangel',
        items: []
      }
    ],
    sidebar: {
      '/code/' : [
        {
          title: 'Vue',
          collapsable: false,
          children: [
            'vue/vuex.md',
            'vue/vue-router.md'
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