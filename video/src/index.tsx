import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Film} from './Film';
import film from './film.json';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';
import './style.css';

const Root = () => <Composition id="SafeNight" component={Film} width={1920} height={1080} fps={film.fps} durationInFrames={film.duration*film.fps} />;
registerRoot(Root);
