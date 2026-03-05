<div align="center">

# next-pwa-auto

**Near-zero setup PWA plugin for Next.js 14+**

Turn any Next.js app into a Progressive Web App with minimal setup.

[![npm version](https://img.shields.io/npm/v/next-pwa-auto.svg)](https://www.npmjs.com/package/next-pwa-auto)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

</div>

---

## Quick Start

```bash
npx next-pwa-auto init
```

If you prefer manual setup:

```bash
npm install next-pwa-auto
```

```js
// next.config.js
const withPWAAuto = require('next-pwa-auto').default;
module.exports = withPWAAuto()({});
```

---

## Documentation

Detailed guides and all options are in docs:

- Docs root: `docs/`
- Get Started: https://npwa.js.org/get-started
- Usage: https://npwa.js.org/usage
- FAQ: https://npwa.js.org/faq

---

## License

[MIT](LICENSE)
