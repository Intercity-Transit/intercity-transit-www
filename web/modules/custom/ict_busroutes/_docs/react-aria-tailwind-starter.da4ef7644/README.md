Starter project from https://react-spectrum.adobe.com/react-aria/getting-started.html


Confirm dependencies:
```
node --version
npm --version
nvm --version
yarn --version
```

If needed, install missing dependencies.  Run `nvm use` in your terminal,
so our node version used. You may need to run `nvm install` to get the project
version (22.18) first.

## Start the project:
To start the development server:
```
cd /home/nmeyer/www/intercity-transit/web/modules/custom/react-aria-tailwind-starter.da4ef7644
nvm use --lts
yarn storybook
```
To stop the server:
  - Press `Ctrl+C` in the terminal where Storybook is running

To install dependencies (when you modify package.json):
```
yarn install
```
Project Structure:
  - src/ - Contains your React components
  - stories/ - Contains Storybook stories (examples of how to use components)
  - package.json - Lists all dependencies and scripts
  - tsconfig.json - TypeScript configuration


