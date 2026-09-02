import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Font from 'expo-font';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createMusicSourcePlugin, type UnifiedSong } from '@linmo/core';
import { getDocumentAsync } from 'expo-document-picker';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors, radii, spacing } from './src/theme';
import { readPluginPackageData } from './src/plugin-package';

type Tab = 'home' | 'library' | 'plugins' | 'settings';
type SettingsSection = 'playback' | 'library' | 'privacy';
type LibraryCategory = 'all' | 'songs' | 'albums' | 'artists';
type PluginCategory = 'all' | 'installed' | 'sources' | 'tools';
type LocalSong = UnifiedSong & { readonly mediaUri: string };
type LocalPlugin = {
  id: string;
  name: string;
  version: string;
  capabilities: string[];
  description: string;
  category: Exclude<PluginCategory, 'all' | 'installed'>;
  enabled: boolean;
  packageUri?: string;
};
type IconName = keyof typeof Ionicons.glyphMap;
const ONBOARDING_STORAGE_KEY = '@linmo/onboarding-complete';
const PLUGINS_STORAGE_KEY = '@linmo/plugins';
const SONGS_STORAGE_KEY = '@linmo/songs';

const tabs: readonly { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: '本地音乐', icon: 'home-outline' },
  { id: 'library', label: '音乐库', icon: 'musical-notes-outline' },
  { id: 'plugins', label: '插件中心', icon: 'extension-puzzle-outline' },
  { id: 'settings', label: '应用设置', icon: 'settings-outline' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [songs, setSongs] = useState<LocalSong[]>([]);
  const [currentSong, setCurrentSong] = useState<LocalSong | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const [backgroundPlayback, setBackgroundPlayback] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const onboardingOpacity = useRef(new Animated.Value(0)).current;
  const audioPlayer = useAudioPlayer(null, { updateInterval: 500 });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const isPlaying = audioStatus.playing;

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(
      () => undefined,
    );
  }, []);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(SONGS_STORAGE_KEY).then((value) => {
      if (!mounted || !value) return;
      try {
        setSongs(JSON.parse(value) as LocalSong[]);
      } catch {
        /* ignore corrupt local data */
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
  }, [songs]);

  useEffect(() => {
    Animated.timing(onboardingOpacity, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [onboardingOpacity]);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(ONBOARDING_STORAGE_KEY).then((value) => {
      if (mounted && value !== '1') setShowOnboarding(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const finishOnboarding = () => {
    Animated.timing(onboardingOpacity, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setShowOnboarding(false);
      void AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    });
  };

  const importSongs = async () => {
    const result = await getDocumentAsync({
      type: 'audio/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const imported: LocalSong[] = await Promise.all(
      result.assets.map(async (asset) => {
        const title = asset.name.replace(/\.[^/.]+$/, '');
        let mediaUri = asset.uri;
        try {
          const source = new File(asset.uri);
          const destination = new File(Paths.document, 'library', asset.name);
          destination.parentDirectory.create({ idempotent: true, intermediates: true });
          source.copy(destination);
          mediaUri = destination.uri;
        } catch {
          /* retain the picker URI if a platform disallows copying */
        }
        return {
          key: `local:${asset.uri}`,
          pluginId: 'local',
          sourceId: 'local',
          remoteId: asset.uri,
          title,
          artist: '本地文件',
          mediaUri,
        };
      }),
    );
    setSongs((current) => [...current, ...imported]);
    if (!currentSong && imported[0]) {
      setCurrentSong(imported[0]);
      setActiveTab('home');
    }
  };

  const playSong = (song: LocalSong) => {
    if (currentSong?.mediaUri !== song.mediaUri) audioPlayer.replace({ uri: song.mediaUri });
    audioPlayer.play();
    setCurrentSong(song);
  };

  const togglePlaying = () => {
    if (!currentSong) {
      void importSongs();
      return;
    }
    if (audioStatus.playing) audioPlayer.pause();
    else audioPlayer.play();
  };

  const toggleBackgroundPlayback = () => {
    const nextValue = !backgroundPlayback;
    setBackgroundPlayback(nextValue);
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: nextValue }).catch(
      () => undefined,
    );
  };

  const clearLibrary = () => {
    audioPlayer.pause();
    setSongs([]);
    setCurrentSong(null);
    setSettingsSection(null);
    void AsyncStorage.removeItem(SONGS_STORAGE_KEY);
  };

  const resetOnboarding = () => {
    setOnboardingStep(0);
    onboardingOpacity.setValue(1);
    setShowOnboarding(true);
    void AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
  };

  const subtitle = useMemo(() => {
    switch (activeTab) {
      case 'home':
        return '本地音乐';
      case 'library':
        return '音乐库';
      case 'plugins':
        return '插件中心';
      case 'settings':
        return '应用设置';
    }
  }, [activeTab]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>LINMO PLAYER</Text>
            <Text style={styles.appTitle}>{subtitle}</Text>
          </View>
          <Pressable
            style={styles.avatar}
            onPress={() => setProfileMenuOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="打开账户菜单"
            accessibilityState={{ expanded: profileMenuOpen }}
          >
            <Text style={styles.avatarText}>?</Text>
          </Pressable>
        </View>
        {profileMenuOpen && <ProfileMenu />}

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {activeTab === 'home' && (
            <HomeScreen
              songs={songs}
              currentSong={currentSong}
              isPlaying={isPlaying}
              onImport={importSongs}
              onPlaySong={playSong}
              onTogglePlaying={togglePlaying}
            />
          )}
          {activeTab === 'library' && (
            <LibraryScreen
              songs={songs}
              onImport={importSongs}
              onPlaySong={playSong}
              currentSong={currentSong}
            />
          )}
          {activeTab === 'plugins' && <PluginsScreen />}
          {activeTab === 'settings' && (
            <SettingsScreen
              section={settingsSection}
              songCount={songs.length}
              backgroundPlayback={backgroundPlayback}
              onSelect={setSettingsSection}
              onBack={() => setSettingsSection(null)}
              onToggleBackgroundPlayback={toggleBackgroundPlayback}
              onClearLibrary={clearLibrary}
              onResetOnboarding={resetOnboarding}
            />
          )}
        </ScrollView>

        <MiniPlayer
          song={currentSong}
          songs={songs}
          isPlaying={isPlaying}
          onToggle={togglePlaying}
          onPlaySong={playSong}
        />
        <View style={styles.bottomNav}>
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={tab.label}
                onPress={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== 'settings') setSettingsSection(null);
                }}
                style={styles.navItem}
              >
                <View style={[styles.navIcon, selected && styles.navIconSelected]}>
                  <AppIcon
                    name={tab.icon}
                    size={22}
                    color={selected ? colors.onSecondaryContainer : colors.onSurfaceVariant}
                  />
                </View>
                <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {showOnboarding && (
          <OnboardingOverlay
            step={onboardingStep}
            opacity={onboardingOpacity}
            onImport={importSongs}
            onNext={() => setOnboardingStep((step) => Math.min(step + 1, 2))}
            onFinish={finishOnboarding}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({
  songs,
  currentSong,
  isPlaying,
  onImport,
  onPlaySong,
  onTogglePlaying,
}: {
  songs: readonly LocalSong[];
  currentSong: LocalSong | null;
  isPlaying: boolean;
  onImport: () => void;
  onPlaySong: (song: LocalSong) => void;
  onTogglePlaying: () => void;
}) {
  const orbScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, {
          toValue: 1.05,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(orbScale, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [orbScale]);
  return (
    <>
      <View style={styles.heroCard}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>本地音乐</Text>
          <Text style={styles.heroTitle}>
            {songs.length ? '本地音乐播放' : '开始使用 Linmo Player'}
          </Text>
          <Text style={styles.heroBody}>
            {songs.length
              ? '当前内容为已导入的本地音频文件。'
              : '导入本地音频文件后，即可在此管理和播放。'}
          </Text>
          <Pressable
            style={styles.primaryButton}
            accessibilityRole="button"
            onPress={currentSong ? onTogglePlaying : onImport}
          >
            <Text style={styles.primaryButtonText}>
              {currentSong && isPlaying ? '暂停' : currentSong ? '播放' : '导入音乐'}
            </Text>
            <AppIcon name={isPlaying ? 'pause' : 'play'} size={14} color={colors.onPrimary} />
          </Pressable>
        </View>
        <Animated.View style={[styles.heroOrb, { transform: [{ scale: orbScale }] }]}>
          <View style={styles.heroOrbInner} />
        </Animated.View>
      </View>

      <SectionHeader title="本地音乐" action="全部" />
      {songs.length === 0 ? (
        <EmptyLibrary onImport={onImport} />
      ) : (
        <View style={styles.songList}>
          {songs.map((song, index) => (
            <SongRow
              key={song.key}
              song={song}
              index={index}
              active={song.key === currentSong?.key}
              onPress={() => onPlaySong(song)}
            />
          ))}
        </View>
      )}

      <SectionHeader title="音乐库" action={songs.length ? `${songs.length} 首` : '暂无音乐'} />
      <Text style={styles.sectionHint}>音乐文件仅在本设备本地使用。</Text>
    </>
  );
}

function LibraryScreen({
  songs,
  onImport,
  onPlaySong,
  currentSong,
}: {
  songs: readonly LocalSong[];
  onImport: () => void;
  onPlaySong: (song: LocalSong) => void;
  currentSong: LocalSong | null;
}) {
  const [category, setCategory] = useState<LibraryCategory>('all');
  const categories: readonly [LibraryCategory, string][] = [
    ['all', '全部'],
    ['songs', '歌曲'],
    ['albums', '专辑'],
    ['artists', '歌手'],
  ];
  const groupedSongs = new Map<string, LocalSong[]>();
  if (category === 'albums' || category === 'artists') {
    songs.forEach((song) => {
      const label = category === 'albums' ? song.album || '未知专辑' : song.artist || '未知歌手';
      const group = groupedSongs.get(label) ?? [];
      group.push(song);
      groupedSongs.set(label, group);
    });
  }
  const renderSong = (song: LocalSong) => (
    <SongRow
      key={song.key}
      song={song}
      index={songs.indexOf(song)}
      active={song.key === currentSong?.key}
      onPress={() => onPlaySong(song)}
    />
  );
  const albumCount = new Set(songs.map((song) => song.album).filter(Boolean)).size;
  const artistCount = new Set(
    songs.map((song) => song.artist).filter((artist) => artist && artist !== '本地文件'),
  ).size;
  const formatCount = new Set(
    songs.map((song) => song.mediaUri.split('.').pop()?.toUpperCase()).filter(Boolean),
  ).size;
  return (
    <>
      <View style={styles.libraryHeader}>
        <Text style={styles.libraryCount}>{songs.length} 首音乐</Text>
      </View>
      <View style={styles.libraryStats}>
        <LibraryStat label="曲目" value={songs.length} caption="已导入音频" />
        <LibraryStat
          label="专辑"
          value={albumCount}
          caption={albumCount ? '已识别' : '等待元数据'}
        />
        <LibraryStat
          label="歌手"
          value={artistCount}
          caption={artistCount ? '已识别' : '等待元数据'}
        />
        <LibraryStat label="格式" value={formatCount || '—'} caption="文件格式" />
      </View>
      <View style={styles.filterRow}>
        {categories.map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setCategory(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: category === id }}
          >
            <Chip label={label} selected={category === id} />
          </Pressable>
        ))}
        <Pressable onPress={onImport}>
          <Chip label="导入本地音乐" />
        </Pressable>
      </View>
      {songs.length === 0 ? (
        <EmptyLibrary onImport={onImport} />
      ) : category === 'albums' || category === 'artists' ? (
        <View style={styles.libraryGroups}>
          {[...groupedSongs.entries()].map(([label, group]) => (
            <View key={label} style={styles.libraryGroup}>
              <View style={styles.libraryGroupHeader}>
                <Text style={styles.libraryGroupTitle}>{label}</Text>
                <Text style={styles.libraryGroupCount}>{group.length} 首</Text>
              </View>
              <View style={styles.songList}>{group.map(renderSong)}</View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.songList}>{songs.map(renderSong)}</View>
      )}
    </>
  );
}

function LibraryStat({
  label,
  value,
  caption,
}: {
  label: string;
  value: number | string;
  caption: string;
}) {
  return (
    <View style={styles.libraryStat}>
      <Text style={styles.libraryStatLabel}>{label}</Text>
      <Text style={styles.libraryStatValue}>{value}</Text>
      <Text style={styles.libraryStatCaption}>{caption}</Text>
    </View>
  );
}

function EmptyLibrary({ onImport }: { onImport: () => void }) {
  return (
    <View style={styles.libraryEmpty}>
      <View style={styles.libraryEmptyIcon}>
        <AppIcon name="musical-notes-outline" size={27} color={colors.primary} />
      </View>
      <View style={styles.libraryEmptyCopy}>
        <Text style={styles.libraryEmptyTitle}>暂无音乐</Text>
        <Text style={styles.libraryEmptyBody}>当前音乐库为空，导入本地音频文件后将在此显示。</Text>
        <View style={styles.libraryEmptyMeta}>
          <Text style={styles.libraryEmptyMetaLabel}>支持格式</Text>
          <Text style={styles.libraryEmptyMetaValue}>MP3 · M4A · WAV</Text>
        </View>
      </View>
      <Pressable
        style={[styles.outlineButton, styles.libraryEmptyButton]}
        accessibilityRole="button"
        onPress={onImport}
      >
        <Text style={styles.outlineButtonText}>导入本地音乐</Text>
      </Pressable>
    </View>
  );
}

function PluginsScreen() {
  const [showDetails, setShowDetails] = useState(false);
  const [category, setCategory] = useState<PluginCategory>('all');
  const [plugins, setPlugins] = useState<LocalPlugin[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedSong[]>([]);
  const [searching, setSearching] = useState(false);
  const categories: readonly [PluginCategory, string][] = [
    ['all', '全部'],
    ['installed', '已安装'],
    ['sources', '音源'],
    ['tools', '工具'],
  ];
  const detailOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    void AsyncStorage.getItem(PLUGINS_STORAGE_KEY)
      .then((value) => {
        if (value) setPlugins(JSON.parse(value));
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    Animated.timing(detailOpacity, {
      toValue: showDetails ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [detailOpacity, showDetails]);
  if (showDetails)
    return (
      <Animated.View style={[styles.settingsDetail, { opacity: detailOpacity }]}>
        <Pressable onPress={() => setShowDetails(false)} accessibilityRole="button">
          <View style={styles.settingsBackRow}>
            <AppIcon name="chevron-back" size={17} color={colors.primary} />
            <Text style={styles.settingsBack}>返回插件中心</Text>
          </View>
        </Pressable>
        <Text style={styles.sectionTitle}>插件说明</Text>
        <Text style={styles.settingsDescription}>
          插件通过统一契约接入搜索、播放、歌词、歌单和账户等能力，并由宿主统一管理。
        </Text>
        <Text style={styles.settingsNote}>
          导入插件 ZIP 后，可查看版本、能力范围并控制启用状态。ZIP 内文件会先经过清单和路径校验。
        </Text>
      </Animated.View>
    );
  const filteredPlugins = plugins.filter(
    (plugin) => category === 'all' || category === 'installed' || plugin.category === category,
  );
  const importPlugin = async () => {
    const result = await getDocumentAsync({ type: 'application/zip', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    try {
      const packageData = await readPluginPackageData(result.assets[0].uri);
      const manifest = packageData.manifest;
      if (manifest.kind === 'font' && manifest.font) {
        const fontFile = packageData.files.find((file) => file.name === manifest.font?.file);
        if (fontFile) {
          const storedFont = new File(
            Paths.document,
            'fonts',
            `${manifest.id}-${fontFile.name.split('/').pop() ?? 'font.ttf'}`,
          );
          storedFont.parentDirectory.create({ idempotent: true, intermediates: true });
          storedFont.write(fontFile.bytes);
          await Font.loadAsync(manifest.font.family, { uri: storedFont.uri });
        }
      } else if (manifest.kind === 'music-source') {
        const plugin = createMusicSourcePlugin(manifest);
        await plugin.initialize?.({
          sourceId: manifest.id,
          storage: {
            get: (key) => AsyncStorage.getItem(`@linmo/plugin/${manifest.id}/${key}`),
            set: (key, value) => AsyncStorage.setItem(`@linmo/plugin/${manifest.id}/${key}`, value),
            remove: (key) => AsyncStorage.removeItem(`@linmo/plugin/${manifest.id}/${key}`),
          },
          log: () => undefined,
        });
      }
      const capabilities = [...manifest.capabilities];
      const plugin: LocalPlugin = {
        id: manifest.id,
        name: String(manifest.name),
        version: String(manifest.version),
        capabilities,
        description:
          typeof manifest.description === 'string' ? manifest.description : '未提供插件说明。',
        category: capabilities.some((capability) =>
          ['search', 'playback', 'lyrics', 'recommendations'].includes(capability),
        )
          ? 'sources'
          : 'tools',
        enabled: false,
        packageUri: result.assets[0].uri,
      };
      const next = [...plugins.filter((item) => item.id !== plugin.id), plugin];
      setPlugins(next);
      await AsyncStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      Alert.alert('插件 ZIP 无效', error instanceof Error ? error.message : '无法读取插件 ZIP。');
    }
  };
  const togglePlugin = async (id: string) => {
    const next = plugins.map((plugin) =>
      plugin.id === id ? { ...plugin, enabled: !plugin.enabled } : plugin,
    );
    setPlugins(next);
    await AsyncStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(next));
  };
  const removePlugin = async (id: string) => {
    const next = plugins.filter((plugin) => plugin.id !== id);
    setPlugins(next);
    await AsyncStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(next));
  };
  const searchRemote = async () => {
    if (!query.trim()) return;
    const source = plugins.find(
      (plugin) => plugin.enabled && plugin.category === 'sources' && plugin.packageUri,
    );
    if (!source?.packageUri) {
      Alert.alert('没有可用音源', '请先导入并启用一个音源插件。');
      return;
    }
    setSearching(true);
    try {
      const manifest = (await readPluginPackageData(source.packageUri)).manifest;
      const plugin = createMusicSourcePlugin(manifest);
      const response = await plugin.search?.({
        query: query.trim(),
        type: 'song',
        page: 1,
        pageSize: 20,
      });
      setSearchResults(
        response?.items.map((item) => ({
          ...item,
          pluginId: manifest.id,
          sourceId: manifest.id,
          key: `${manifest.id}:${item.remoteId}`,
        })) ?? [],
      );
    } catch (error) {
      Alert.alert('搜索失败', error instanceof Error ? error.message : '音源请求失败。');
    } finally {
      setSearching(false);
    }
  };
  return (
    <>
      <View style={styles.libraryHeader}>
        <Text style={styles.libraryCount}>{plugins.length} 个插件</Text>
        <Pressable onPress={importPlugin}>
          <Chip label="导入插件 ZIP" />
        </Pressable>
      </View>
      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void searchRemote()}
          placeholder="搜索歌曲、歌手"
          placeholderTextColor={colors.onSurfaceVariant}
          style={styles.searchInput}
          returnKeyType="search"
        />
        <Pressable style={styles.searchButton} onPress={() => void searchRemote()}>
          <Text style={styles.primaryButtonText}>{searching ? '搜索中' : '搜索'}</Text>
        </Pressable>
      </View>
      {searchResults.length > 0 && (
        <View style={styles.songList}>
          {searchResults.map((song, index) => (
            <SongRow
              key={song.key}
              song={song}
              index={index}
              active={false}
              onPress={() => undefined}
            />
          ))}
        </View>
      )}
      <View style={styles.filterRow}>
        {categories.map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setCategory(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: category === id }}
          >
            <Chip label={label} selected={category === id} />
          </Pressable>
        ))}
      </View>
      {filteredPlugins.length ? (
        <View style={styles.pluginList}>
          {filteredPlugins.map((plugin) => (
            <View key={plugin.id} style={styles.pluginCard}>
              <View style={styles.pluginIcon}>
                <AppIcon name="extension-puzzle-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.pluginCopy}>
                <Text style={styles.pluginTitle}>{plugin.name}</Text>
                <Text style={styles.pluginDescription}>{plugin.description}</Text>
                <Text style={styles.pluginMeta}>
                  v{plugin.version} · {plugin.enabled ? '已启用' : '已停用'}
                </Text>
              </View>
              <View style={styles.pluginActions}>
                <Pressable
                  style={[styles.smallOutlineButton, plugin.enabled && styles.pluginEnabledButton]}
                  onPress={() => void togglePlugin(plugin.id)}
                >
                  <Text style={styles.outlineButtonText}>{plugin.enabled ? '停用' : '启用'}</Text>
                </Pressable>
                <Pressable onPress={() => void removePlugin(plugin.id)}>
                  <Text style={styles.pluginRemove}>卸载</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.libraryEmpty}>
          <View style={styles.libraryEmptyIcon}>
            <AppIcon name="extension-puzzle-outline" size={27} color={colors.primary} />
          </View>
          <View style={styles.libraryEmptyCopy}>
            <Text style={styles.libraryEmptyTitle}>
              {category === 'all' ? '暂无已安装插件' : '此分类暂无插件'}
            </Text>
            <Text style={styles.libraryEmptyBody}>
              {category === 'all'
                ? '导入插件 ZIP 后，可在此管理版本、能力与启用状态。'
                : '当前没有符合此分类的插件。'}
            </Text>
            <Pressable
              style={[styles.outlineButton, styles.libraryEmptyButton]}
              accessibilityRole="button"
              onPress={importPlugin}
            >
              <Text style={styles.outlineButtonText}>导入插件 ZIP</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => setShowDetails(true)}>
            <Text style={styles.pluginDocsLink}>查看插件说明</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

function ProfileMenu() {
  return (
    <View style={styles.profileMenu}>
      <Text style={styles.profileMenuEyebrow}>ACCOUNT</Text>
      <Text style={styles.profileMenuTitle}>未登录</Text>
      <Text style={styles.profileMenuSubtitle}>本地模式</Text>
      <View style={styles.profileMenuDivider} />
      <View style={styles.profileMenuRow}>
        <Text style={styles.profileMenuLabel}>账户状态</Text>
        <Text style={styles.profileMenuValue}>未登录</Text>
      </View>
      <View style={styles.profileMenuRow}>
        <Text style={styles.profileMenuLabel}>已连接插件</Text>
        <Text style={styles.profileMenuValue}>0 个</Text>
      </View>
      <Text style={styles.profileMenuNote}>安装并连接插件后，插件提供的头像会显示在这里。</Text>
    </View>
  );
}

function SettingsScreen({
  section,
  songCount,
  backgroundPlayback,
  onSelect,
  onBack,
  onToggleBackgroundPlayback,
  onClearLibrary,
  onResetOnboarding,
}: {
  section: SettingsSection | null;
  songCount: number;
  backgroundPlayback: boolean;
  onSelect: (section: SettingsSection) => void;
  onBack: () => void;
  onToggleBackgroundPlayback: () => void;
  onClearLibrary: () => void;
  onResetOnboarding: () => void;
}) {
  const listOpacity = useRef(new Animated.Value(0)).current;
  const listOffset = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    if (section !== null) return;
    listOpacity.setValue(0);
    listOffset.setValue(-10);
    Animated.parallel([
      Animated.timing(listOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(listOffset, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [listOffset, listOpacity, section]);

  if (section === 'playback') {
    return (
      <SettingsDetail title="播放设置" description="配置播放器的默认行为。" onBack={onBack}>
        <Pressable
          style={styles.settingDetailRow}
          onPress={onToggleBackgroundPlayback}
          accessibilityRole="switch"
          accessibilityState={{ checked: backgroundPlayback }}
        >
          <View style={styles.settingDetailCopy}>
            <Text style={styles.settingTitle}>后台播放</Text>
            <Text style={styles.settingBody}>切换到其他应用时继续播放音频。</Text>
          </View>
          <PlaybackToggle enabled={backgroundPlayback} />
        </Pressable>
        <View style={styles.settingDetailRow}>
          <View style={styles.settingDetailCopy}>
            <Text style={styles.settingTitle}>播放方式</Text>
            <Text style={styles.settingBody}>点按曲目后立即开始播放。</Text>
          </View>
        </View>
      </SettingsDetail>
    );
  }
  if (section === 'library') {
    return (
      <SettingsDetail title="本地音乐" description="管理当前会话中导入的音频文件。" onBack={onBack}>
        <View style={styles.settingDetailRow}>
          <View style={styles.settingDetailCopy}>
            <Text style={styles.settingTitle}>当前音乐数量</Text>
            <Text style={styles.settingBody}>{songCount} 首本地音乐</Text>
          </View>
        </View>
        <Text style={styles.settingsNote}>
          导入的文件仅在当前运行期间可用，关闭应用后不会自动保留。
        </Text>
        <Pressable style={styles.outlineButton} onPress={onClearLibrary} accessibilityRole="button">
          <Text style={styles.outlineButtonText}>清空当前歌库</Text>
        </Pressable>
      </SettingsDetail>
    );
  }
  if (section === 'privacy') {
    return (
      <SettingsDetail
        title="隐私与安全"
        description="Linmo Player 的代码、插件契约与数据处理边界公开可审查。"
        onBack={onBack}
      >
        <Text style={styles.settingsNote}>
          本项目采用开源架构，音乐文件、插件配置与播放器偏好均由本地应用管理。你可以自行审查源代码、插件清单和权限声明。
        </Text>
        <View style={styles.settingDetailRow}>
          <View style={styles.settingDetailCopy}>
            <Text style={styles.settingTitle}>新手引导</Text>
            <Text style={styles.settingBody}>重新查看首次使用说明。</Text>
          </View>
          <Pressable style={styles.smallOutlineButton} onPress={onResetOnboarding}>
            <Text style={styles.outlineButtonText}>重新查看</Text>
          </Pressable>
        </View>
      </SettingsDetail>
    );
  }
  const items: readonly [SettingsSection, string, string][] = [
    ['playback', '播放设置', '音质和播放方式'],
    ['library', '本地音乐', '导入文件与音乐库'],
    ['privacy', '隐私与安全', '本地数据和插件权限'],
  ];
  return (
    <Animated.View style={{ opacity: listOpacity, transform: [{ translateX: listOffset }] }}>
      <View style={styles.settingsCard}>
        {items.map(([id, title, body], index) => (
          <Pressable
            key={id}
            style={({ pressed }) => [
              styles.settingRow,
              index < items.length - 1 && styles.settingRowBorder,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => onSelect(id)}
            accessibilityRole="button"
          >
            <View>
              <Text style={styles.settingTitle}>{title}</Text>
              <Text style={styles.settingBody}>{body}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.versionCard}>
        <Text style={styles.versionLabel}>LINMO PLAYER</Text>
        <Text style={styles.versionText}>版本 0.1.0</Text>
      </View>
    </Animated.View>
  );
}

function PlaybackToggle({ enabled }: { enabled: boolean }) {
  const progress = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: enabled ? 1 : 0,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [enabled, progress]);
  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.outlineVariant, colors.primary],
  });
  const thumbOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  return (
    <Animated.View style={[styles.toggle, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbOffset }] }]} />
    </Animated.View>
  );
}

function SettingsDetail({
  title,
  description,
  onBack,
  children,
}: {
  title: string;
  description: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const offset = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(offset, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [offset, opacity]);
  return (
    <Animated.View
      style={[styles.settingsDetail, { opacity, transform: [{ translateX: offset }] }]}
    >
      <Pressable onPress={onBack} accessibilityRole="button">
        <View style={styles.settingsBackRow}>
          <AppIcon name="chevron-back" size={17} color={colors.primary} />
          <Text style={styles.settingsBack}>返回应用设置</Text>
        </View>
      </Pressable>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.settingsDescription}>{description}</Text>
      <View style={styles.settingsDetailCard}>{children}</View>
    </Animated.View>
  );
}

function SectionHeader({ title, action }: { title: string; action: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionAction}>{action}</Text>
    </View>
  );
}

function SongRow({
  song,
  index,
  active,
  onPress,
}: {
  song: UnifiedSong;
  index: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.songRow, pressed && styles.songRowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${song.title}，${song.artist}`}
    >
      <CoverTile index={index} size={52} />
      <View style={styles.songInfo}>
        <Text style={[styles.songTitle, active && styles.songTitleActive]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {song.artist}
          {song.album ? ` · ${song.album}` : ''}
        </Text>
      </View>
      <AppIcon
        name={active ? 'musical-notes' : 'ellipsis-horizontal'}
        size={19}
        color={active ? colors.primary : colors.onSurfaceVariant}
      />
    </Pressable>
  );
}

function CoverTile({ index, size }: { index: number; size: number }) {
  const coverColors = [
    colors.primaryContainer,
    colors.tertiaryContainer,
    '#D7E8D1',
    '#F9DEDC',
  ] as const;
  const glyphs: readonly IconName[] = [
    'musical-note-outline',
    'disc-outline',
    'radio-outline',
    'sparkles-outline',
  ];
  const backgroundColor = coverColors[index % coverColors.length]!;
  const glyph = glyphs[index % glyphs.length]!;
  return (
    <View style={[styles.coverTile, { width: size, height: size, backgroundColor }]}>
      <AppIcon name={glyph} size={Math.round(size * 0.45)} color={colors.primary} />
    </View>
  );
}

function AppIcon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function Chip({ label, selected = false }: { label: string; selected?: boolean }) {
  return (
    <View style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </View>
  );
}

function MiniPlayer({
  song,
  songs,
  isPlaying,
  onToggle,
  onPlaySong,
}: {
  song: LocalSong | null;
  songs: readonly LocalSong[];
  isPlaying: boolean;
  onToggle: () => void;
  onPlaySong: (song: LocalSong) => void;
}) {
  const index = song ? songs.indexOf(song) : -1;
  const previousSong = index > 0 ? songs[index - 1] : null;
  const nextSong = index >= 0 ? songs[index + 1] : null;
  return (
    <View style={styles.miniPlayer}>
      {song ? (
        <>
          <CoverTile index={0} size={44} />
          <View style={styles.miniInfo}>
            <Text style={styles.miniTitle} numberOfLines={1}>
              {song.title}
            </Text>
            <Text style={styles.miniArtist} numberOfLines={1}>
              {song.artist}
            </Text>
          </View>
        </>
      ) : (
        <Text style={styles.miniEmpty}>还没有正在播放的歌曲</Text>
      )}
      <Pressable
        disabled={!previousSong}
        onPress={() => previousSong && onPlaySong(previousSong)}
        accessibilityRole="button"
        accessibilityLabel="上一首"
        style={styles.miniControl}
      >
        <AppIcon
          name="chevron-back"
          size={21}
          color={previousSong ? colors.onSurfaceVariant : colors.outlineVariant}
        />
      </Pressable>
      <Pressable
        disabled={!song}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? '暂停' : '播放'}
        style={styles.miniButton}
      >
        <AppIcon
          name={isPlaying ? 'pause' : 'play'}
          size={15}
          color={song ? colors.onPrimary : colors.outlineVariant}
        />
      </Pressable>
      <Pressable
        disabled={!nextSong}
        onPress={() => nextSong && onPlaySong(nextSong)}
        accessibilityRole="button"
        accessibilityLabel="下一首"
        style={styles.miniControl}
      >
        <AppIcon
          name="chevron-forward"
          size={21}
          color={nextSong ? colors.onSurfaceVariant : colors.outlineVariant}
        />
      </Pressable>
    </View>
  );
}

const onboardingSlides = [
  {
    icon: 'musical-notes-outline',
    eyebrow: '1 / 3',
    title: '导入本地音乐',
    body: '请选择设备中的 MP3、M4A 或 WAV 音频文件。',
    action: '导入音乐',
  },
  {
    icon: 'play',
    eyebrow: '2 / 3',
    title: '播放与控制',
    body: '选择任意曲目即可播放，可通过底部播放器进行暂停与继续。',
    action: '下一步',
  },
  {
    icon: 'extension-puzzle-outline',
    eyebrow: '3 / 3',
    title: '插件扩展',
    body: '后续可通过插件接入外部音源，当前版本仅支持本地音乐。',
    action: '开始使用',
  },
] as const;

function OnboardingOverlay({
  step,
  opacity,
  onImport,
  onNext,
  onFinish,
}: {
  step: number;
  opacity: Animated.Value;
  onImport: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const slide = onboardingSlides[step] ?? onboardingSlides[0];
  const isLast = step === onboardingSlides.length - 1;
  const handlePrimary = () => {
    if (isLast) onFinish();
    else {
      if (step === 0) onImport();
      onNext();
    }
  };
  return (
    <Animated.View style={[styles.onboardingOverlay, { opacity }]}>
      <View style={styles.onboardingCard}>
        <View style={styles.onboardingIcon}>
          <AppIcon name={slide.icon} size={30} color={colors.primary} />
        </View>
        <Text style={styles.onboardingEyebrow}>{slide.eyebrow}</Text>
        <Text style={styles.onboardingTitle}>{slide.title}</Text>
        <Text style={styles.onboardingBody}>{slide.body}</Text>
        <View style={styles.onboardingDots}>
          {onboardingSlides.map((_, index) => (
            <View
              key={index}
              style={[styles.onboardingDot, index === step && styles.onboardingDotActive]}
            />
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          accessibilityRole="button"
          onPress={handlePrimary}
        >
          <Text style={styles.primaryButtonText}>{slide.action}</Text>
          <AppIcon
            name={isLast ? 'checkmark' : 'arrow-forward'}
            size={15}
            color={colors.onPrimary}
          />
        </Pressable>
        {!isLast && (
          <Pressable style={styles.skipButton} onPress={onFinish}>
            <Text style={styles.skipButtonText}>跳过引导</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  appShell: { flex: 1 },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  appTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '600', maxWidth: 280 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.onSecondaryContainer, fontSize: 19, fontWeight: '700' },
  profileMenu: {
    position: 'absolute',
    top: 62,
    right: spacing.lg,
    zIndex: 14,
    width: 230,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 8,
  },
  profileMenuEyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  profileMenuTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  profileMenuSubtitle: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 4 },
  profileMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginVertical: spacing.md,
  },
  profileMenuRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  profileMenuLabel: { color: colors.onSurfaceVariant, fontSize: 12 },
  profileMenuValue: { color: colors.onSurface, fontSize: 12, fontWeight: '700' },
  profileMenuNote: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    lineHeight: 17,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: 'rgba(103,80,164,0.08)',
  },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  heroCard: {
    minHeight: 220,
    borderRadius: radii.card,
    backgroundColor: colors.primaryContainer,
    padding: spacing.lg,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl + spacing.sm,
  },
  heroCopy: { flex: 1, zIndex: 1 },
  heroKicker: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.onPrimaryContainer,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '700',
    maxWidth: 220,
  },
  heroBody: {
    color: colors.onPrimaryContainer,
    opacity: 0.72,
    marginTop: spacing.sm,
    fontSize: 14,
  },
  heroOrb: {
    position: 'absolute',
    right: -38,
    bottom: -35,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#D0BCFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOrbInner: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.primary,
    opacity: 0.75,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.control,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    width: 138,
  },
  primaryButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  primaryButtonIcon: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.onSurface, fontSize: 21, fontWeight: '700' },
  sectionAction: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  sectionHint: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 20,
    marginTop: -2,
    marginBottom: spacing.lg,
  },
  songList: { marginBottom: spacing.xl },
  songRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  songRowPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  coverTile: { borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  coverGlyph: { fontSize: 25, color: colors.primary, fontWeight: '600' },
  songInfo: { flex: 1, marginHorizontal: spacing.md },
  songTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  songTitleActive: { color: colors.primary },
  songArtist: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 4 },
  songMore: { color: colors.onSurfaceVariant, fontSize: 16, letterSpacing: 2 },
  playlistRail: { gap: spacing.md, paddingBottom: spacing.md },
  playlistCard: { width: 132 },
  playlistCardLarge: { width: '48%', marginBottom: spacing.lg },
  playlistTitle: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  playlistCount: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 4 },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  libraryCount: { color: colors.onSurfaceVariant, fontSize: 13 },
  libraryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  libraryStat: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 84,
    padding: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceContainer,
  },
  libraryStatLabel: { color: colors.onSurfaceVariant, fontSize: 12 },
  libraryStatValue: { color: colors.onSurface, fontSize: 22, fontWeight: '700', marginTop: 7 },
  libraryStatCaption: { color: colors.onSurfaceVariant, fontSize: 11, marginTop: 5 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainer,
  },
  searchButton: {
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    borderColor: colors.outline,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.secondaryContainer,
    borderColor: colors.secondaryContainer,
  },
  chipText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.onSecondaryContainer },
  libraryGroups: { marginBottom: spacing.xl },
  libraryGroup: { marginBottom: spacing.xl },
  libraryGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  libraryGroupTitle: { color: colors.onSurface, fontSize: 17, fontWeight: '700' },
  libraryGroupCount: { color: colors.onSurfaceVariant, fontSize: 12 },
  libraryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 72 },
  libraryEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.card,
  },
  libraryEmptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryEmptyCopy: { flex: 1 },
  libraryEmptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '700' },
  libraryEmptyBody: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  libraryEmptyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  libraryEmptyMetaLabel: { color: colors.onSurfaceVariant, fontSize: 11 },
  libraryEmptyMetaValue: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  libraryEmptyButton: { marginTop: 0 },
  pluginList: { gap: spacing.sm },
  pluginCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceContainer,
  },
  pluginIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryContainer,
  },
  pluginCopy: { flex: 1 },
  pluginTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  pluginDescription: { color: colors.onSurfaceVariant, fontSize: 12, lineHeight: 18, marginTop: 4 },
  pluginMeta: { color: colors.primary, fontSize: 11, marginTop: 5 },
  pluginActions: { alignItems: 'flex-end', gap: spacing.xs },
  pluginEnabledButton: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  pluginRemove: { color: colors.onSurfaceVariant, fontSize: 11, padding: 4 },
  pluginDocsLink: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyIconText: { fontSize: 31, color: colors.primary },
  emptyTitle: { color: colors.onSurface, fontSize: 23, fontWeight: '700', textAlign: 'center' },
  emptyBody: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  outlineButton: {
    borderColor: colors.outline,
    borderWidth: 1,
    borderRadius: radii.control,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  outlineButtonText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  caption: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: spacing.lg },
  settingsCard: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  settingRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingRowBorder: {
    borderBottomColor: colors.outlineVariant,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  settingBody: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 4 },
  chevron: { color: colors.onSurfaceVariant, fontSize: 25 },
  settingsDetail: { flex: 1 },
  settingsBackRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  settingsBack: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  settingsDescription: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  settingsDetailCard: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
  },
  settingDetailRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  settingDetailCopy: { flex: 1 },
  settingsNote: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 20,
    padding: spacing.md,
    borderRadius: radii.control,
    backgroundColor: 'rgba(103,80,164,0.08)',
    marginTop: spacing.md,
  },
  smallOutlineButton: {
    borderColor: colors.outline,
    borderWidth: 1,
    borderRadius: radii.control,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.outlineVariant,
    padding: 3,
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: colors.primary },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: { transform: [{ translateX: 18 }] },
  versionCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceContainerHigh,
  },
  versionLabel: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  versionText: { color: colors.onSurfaceVariant, marginTop: 8, fontSize: 13 },
  miniPlayer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    minHeight: 72,
    padding: spacing.md,
    paddingRight: spacing.lg,
    borderRadius: radii.control,
    backgroundColor: colors.surfaceContainerHigh,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniInfo: { flex: 1, marginHorizontal: spacing.sm },
  miniTitle: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },
  miniArtist: { color: colors.onSurfaceVariant, fontSize: 11, marginTop: 3 },
  miniControl: { width: 34, height: 42, alignItems: 'center', justifyContent: 'center' },
  miniButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  miniNext: { color: colors.onSurfaceVariant, fontSize: 25, marginLeft: spacing.sm },
  miniEmpty: { color: colors.onSurfaceVariant, fontSize: 12, flex: 1, textAlign: 'center' },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  onboardingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(29, 27, 32, 0.42)',
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  onboardingCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  onboardingIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  onboardingIconText: { color: colors.primary, fontSize: 30, fontWeight: '700' },
  onboardingEyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  onboardingTitle: {
    color: colors.onSurface,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  onboardingBody: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 330,
  },
  onboardingDots: { flexDirection: 'row', gap: 7, marginTop: spacing.lg, marginBottom: spacing.sm },
  onboardingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.outlineVariant },
  onboardingDotActive: { width: 22, backgroundColor: colors.primary },
  skipButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  skipButtonText: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' },
  bottomNav: {
    minHeight: 76,
    backgroundColor: colors.surfaceContainer,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
  navItem: { minWidth: 64, minHeight: 60, alignItems: 'center' },
  navIcon: {
    minWidth: 56,
    minHeight: 32,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconSelected: { backgroundColor: colors.secondaryContainer },
  navIconText: { color: colors.onSurfaceVariant, fontSize: 21 },
  navIconTextSelected: { color: colors.onSecondaryContainer },
  navLabel: { color: colors.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  navLabelSelected: { color: colors.onSurface, fontWeight: '700' },
});
