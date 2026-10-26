import { defineConfig } from 'vitepress'

const packages = [
  'Application', 'Archive', 'Cache', 'Collection', 'Config', 'Console',
  'Container', 'Cron', 'Csrf', 'Database', 'DocBlockGenerator',
  'Environment', 'Event', 'Exceptions', 'Facade', 'Filesystem',
  'Http', 'Logging', 'Macroable', 'Middleware', 'Queue',
  'RateLimiter', 'Redis', 'Router', 'Security', 'ServiceProvider',
  'Session', 'Testing', 'Text', 'Time', 'Validator', 'View'
]

export default defineConfig({
  title: 'Omega MVC',
  description: 'PHP 8.4+ MVC Framework Documentation',
  outDir: '../site',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Packages', link: '/Application' }
    ],
    sidebar: [
      {
        text: 'Packages',
        items: packages.map(pkg => ({
          text: pkg,
          link: `/${pkg}`
        }))
      }
    ],
    editLink: {
      pattern: 'https://github.com/omega-mvc/docs/edit/main/:path'
    },
    search: {
      provider: 'local'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/omega-mvc/framework' }
    ]
  }
})
