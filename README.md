# sutherland

To run the demo:

```
npm install
npm run dev
```

To build the library:

```
npm run build
```

To link against a local version of kombu:

```
# Assumes kombu is in a sibling directory; adjust path if not.
cd ../kombu && npm link && cd - && npm link kombu
```

NOTE: If you're making changes to the local version of Kombu, use `npx vite --force` to run the dev server with cache disabled.
