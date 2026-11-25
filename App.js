import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  BackHandler,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { BUNDLED_HTML } from './bundledHtml';

export default function App() {
  const webViewRef = useRef(null);

  // 1. Force Landscape & Immersive Mode
  useEffect(() => {
    async function configureDisplay() {
      try {
        // Lock to landscape mode on mobile and TV
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

        // Hide Android system navigation bar (Immersive mode)
        if (Platform.OS === 'android') {
          await NavigationBar.setVisibilityAsync('hidden');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
          await NavigationBar.setBackgroundColorAsync('#000000');
        }
      } catch (err) {
        console.warn('[Display Config] Warning:', err);
      }
    }

    configureDisplay();

    // Re-hide navigation bar if app regains focus
    const interval = setInterval(() => {
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('hidden').catch(() => {});
      }
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // 2. Helper to dispatch remote control keys into the Frutiger Aero player
  const sendRemoteKey = (key, keyCode = 0) => {
    if (webViewRef.current) {
      const payload = JSON.stringify({
        type: 'KEY_EVENT',
        key,
        keyCode,
      });
      webViewRef.current.postMessage(payload);
    }
  };

  // 3. Android Hardware Back Button Handler
  useEffect(() => {
    const onBackPress = () => {
      sendRemoteKey('back', 4);
      return true; // Prevent default app exit
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, []);

  // 5. Handle messages from WebView (HTTP bridge, exit, etc.)
  const handleWebViewMessage = async (event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      return;
    }
    if (!data || !data.type) return;

    if (data.type === 'EXIT_APP') {
      BackHandler.exitApp();
      return;
    }

    // Ponte HTTP nativa: evita CORS e permite HTTP simples (IPTV/Xtream/M3U/XMLTV)
    if (data.type === 'HTTP_REQUEST') {
      const requestId = data.id;
      try {
        const response = await fetch(data.url, {
          method: data.method || 'GET',
          headers: data.headers || {},
        });
        const body = await response.text();
        const headers = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: 'HTTP_RESPONSE',
            id: requestId,
            ok: response.ok,
            status: response.status,
            headers,
            body,
          })
        );
      } catch (err) {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: 'HTTP_RESPONSE',
            id: requestId,
            error: (err && err.message) || 'Falha de rede ao conectar no provedor.',
          })
        );
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} translucent={true} />
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{
          html: BUNDLED_HTML,
          baseUrl: 'https://localhost',
        }}
        style={styles.webView}
        containerStyle={styles.container}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        androidHardwareAccelerationDisabled={false}
        allowsFullscreenVideo={true}
        focusable={true}
        scalesPageToFit={true}
        scrollEnabled={false}
        overScrollMode="never"
        onMessage={handleWebViewMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
