// Polyfills must run before the SpacetimeDB SDK (TextDecoder, localStorage) is loaded.
import './src/polyfills';
import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
