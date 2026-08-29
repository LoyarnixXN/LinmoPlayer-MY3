import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { UnifiedSong } from '@linmo/core';
import { getDocumentAsync } from 'expo-document-picker';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors, radii, spacing } from './src/theme';

type Tab = 'home' | 'library' | 'plugins' | 'settings';
type SettingsSection = 'playback' | 'library' | 'privacy';
type LocalSong = UnifiedSong & { readonly mediaUri: string };
const ONBOARDING_STORAGE_KEY = '@linmo/onboarding-complete';

const tabs: readonly { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: '首页', icon: '⌂' },
  { id: 'library', label: '歌库', icon: '♫' },
  { id: 'plugins', label: '插件', icon: '◈' },
  { id: 'settings', label: '设置', icon: '⚙' },
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
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => undefined);
  }, []);

  useEffect(() => {
    Animated.timing(onboardingOpacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [onboardingOpacity]);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(ONBOARDING_STORAGE_KEY).then((value) => {
      if (mounted && value !== '1') setShowOnboarding(true);
    });
    return () => { mounted = false; };
  }, []);

  const finishOnboarding = () => {
    Animated.timing(onboardingOpacity, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setShowOnboarding(false);
      void AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    });
  };

  const importSongs = async () => {
    const result = await getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const imported: LocalSong[] = result.assets.map((asset) => {
      const title = asset.name.replace(/\.[^/.]+$/, '');
      return {
        key: `local:${asset.uri}`,
        pluginId: 'local',
        sourceId: 'local',
        remoteId: asset.uri,
        title,
        artist: '本地文件',
        mediaUri: asset.uri,
      };
    });
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
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: nextValue }).catch(() => undefined);
  };

  const clearLibrary = () => {
    audioPlayer.pause();
    setSongs([]);
    setCurrentSong(null);
    setSettingsSection(null);
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
          <Pressable style={styles.avatar} onPress={() => setProfileMenuOpen((open) => !open)} accessibilityRole="button" accessibilityLabel="打开账户菜单" accessibilityState={{ expanded: profileMenuOpen }}>
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
          {activeTab === 'library' && <LibraryScreen songs={songs} onImport={importSongs} onPlaySong={playSong} currentSong={currentSong} />}
          {activeTab === 'plugins' && <PluginsScreen />}
          {activeTab === 'settings' && <SettingsScreen section={settingsSection} songCount={songs.length} backgroundPlayback={backgroundPlayback} onSelect={setSettingsSection} onBack={() => setSettingsSection(null)} onToggleBackgroundPlayback={toggleBackgroundPlayback} onClearLibrary={clearLibrary} onResetOnboarding={resetOnboarding} />}
        </ScrollView>

        <MiniPlayer song={currentSong} isPlaying={isPlaying} onToggle={togglePlaying} />
        <View style={styles.bottomNav}>
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={tab.label}
                onPress={() => { setActiveTab(tab.id); if (tab.id !== 'settings') setSettingsSection(null); }}
                style={styles.navItem}
              >
                <View style={[styles.navIcon, selected && styles.navIconSelected]}>
                  <Text style={[styles.navIconText, selected && styles.navIconTextSelected]}>{tab.icon}</Text>
                </View>
                <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {showOnboarding && <OnboardingOverlay step={onboardingStep} opacity={onboardingOpacity} onImport={importSongs} onNext={() => setOnboardingStep((step) => Math.min(step + 1, 2))} onFinish={finishOnboarding} />}
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
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(orbScale, { toValue: 1.05, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(orbScale, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [orbScale]);
  return (
    <>
      <View style={styles.heroCard}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>本地音乐</Text>
          <Text style={styles.heroTitle}>{songs.length ? '本地音乐播放' : '开始使用 Linmo Player'}</Text>
          <Text style={styles.heroBody}>{songs.length ? '当前内容为已导入的本地音频文件。' : '导入本地音频文件后，即可在此管理和播放。'}</Text>
          <Pressable style={styles.primaryButton} accessibilityRole="button" onPress={currentSong ? onTogglePlaying : onImport}>
            <Text style={styles.primaryButtonText}>{currentSong && isPlaying ? '暂停' : currentSong ? '播放' : '导入音乐'}</Text>
            <Text style={styles.primaryButtonIcon}>{isPlaying ? 'Ⅱ' : '▶'}</Text>
          </Pressable>
        </View>
        <Animated.View style={[styles.heroOrb, { transform: [{ scale: orbScale }] }]}>
          <View style={styles.heroOrbInner} />
        </Animated.View>
      </View>

      <SectionHeader title="本地音乐" action="全部" />
      {songs.length === 0 ? (
        <EmptyLibrary onImport={onImport} />
      ) : <View style={styles.songList}>
        {songs.map((song, index) => (
          <SongRow key={song.key} song={song} index={index} active={song.key === currentSong?.key} onPress={() => onPlaySong(song)} />
        ))}
      </View>}

      <SectionHeader title="音乐库" action={songs.length ? `${songs.length} 首` : '暂无音乐'} />
      <Text style={styles.sectionHint}>音乐文件仅在本设备本地使用。</Text>
    </>
  );
}

function LibraryScreen({ songs, onImport, onPlaySong, currentSong }: { songs: readonly LocalSong[]; onImport: () => void; onPlaySong: (song: LocalSong) => void; currentSong: LocalSong | null }) {
  return (
    <>
      <View style={styles.libraryHeader}>
      <Text style={styles.sectionTitle}>音乐库</Text>
        <Text style={styles.libraryCount}>{songs.length} 首</Text>
      </View>
      <View style={styles.filterRow}>
        <Chip label="本地文件" selected />
        <Pressable onPress={onImport}><Chip label="导入本地音乐" /></Pressable>
      </View>
      {songs.length === 0 ? <EmptyLibrary onImport={onImport} /> : <View style={styles.songList}>
        {songs.map((song, index) => <SongRow key={song.key} song={song} index={index} active={song.key === currentSong?.key} onPress={() => onPlaySong(song)} />)}
      </View>}
    </>
  );
}

function EmptyLibrary({ onImport }: { onImport: () => void }) {
  return <View style={styles.libraryEmpty}><Text style={styles.libraryEmptyTitle}>暂无音乐</Text><Text style={styles.libraryEmptyBody}>导入本地音频文件后，内容将显示在此处。</Text><Pressable style={styles.outlineButton} accessibilityRole="button" onPress={onImport}><Text style={styles.outlineButtonText}>导入本地音乐</Text></Pressable></View>;
}

function PluginsScreen() {
  const [showDetails, setShowDetails] = useState(false);
  if (showDetails) return <View style={styles.settingsDetail}><Pressable onPress={() => setShowDetails(false)} accessibilityRole="button"><Text style={styles.settingsBack}>‹ 返回插件中心</Text></Pressable><Text style={styles.sectionTitle}>插件说明</Text><Text style={styles.settingsDescription}>插件用于接入外部音源，并将内容转换为 Linmo Player 的统一格式。</Text><Text style={styles.settingsNote}>当前版本暂不安装或运行第三方插件。插件接口仅作为后续扩展预留。</Text></View>;
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>◈</Text></View>
      <Text style={styles.emptyTitle}>插件中心</Text>
      <Text style={styles.emptyBody}>当前尚未安装音源插件。后续可通过独立插件入口接入外部音源。</Text>
      <Pressable style={styles.outlineButton} accessibilityRole="button" onPress={() => setShowDetails(true)}>
        <Text style={styles.outlineButtonText}>查看插件说明</Text>
      </Pressable>
      <Text style={styles.caption}>当前版本仅支持本地音乐</Text>
    </View>
  );
}

function ProfileMenu() {
  return <View style={styles.profileMenu}><Text style={styles.profileMenuEyebrow}>ACCOUNT</Text><Text style={styles.profileMenuTitle}>未登录</Text><Text style={styles.profileMenuSubtitle}>本地模式</Text><View style={styles.profileMenuDivider} /><View style={styles.profileMenuRow}><Text style={styles.profileMenuLabel}>账户状态</Text><Text style={styles.profileMenuValue}>未登录</Text></View><View style={styles.profileMenuRow}><Text style={styles.profileMenuLabel}>已连接插件</Text><Text style={styles.profileMenuValue}>0 个</Text></View><Text style={styles.profileMenuNote}>安装并连接插件后，插件提供的头像会显示在这里。</Text></View>;
}

function SettingsScreen({ section, songCount, backgroundPlayback, onSelect, onBack, onToggleBackgroundPlayback, onClearLibrary, onResetOnboarding }: { section: SettingsSection | null; songCount: number; backgroundPlayback: boolean; onSelect: (section: SettingsSection) => void; onBack: () => void; onToggleBackgroundPlayback: () => void; onClearLibrary: () => void; onResetOnboarding: () => void }) {
  if (section === 'playback') {
    return <SettingsDetail title="播放设置" description="配置播放器的默认行为。" onBack={onBack}>
      <Pressable style={styles.settingDetailRow} onPress={onToggleBackgroundPlayback} accessibilityRole="switch" accessibilityState={{ checked: backgroundPlayback }}>
        <View style={styles.settingDetailCopy}><Text style={styles.settingTitle}>后台播放</Text><Text style={styles.settingBody}>切换到其他应用时继续播放音频。</Text></View>
        <View style={[styles.toggle, backgroundPlayback && styles.toggleActive]}><View style={[styles.toggleThumb, backgroundPlayback && styles.toggleThumbActive]} /></View>
      </Pressable>
      <View style={styles.settingDetailRow}><View style={styles.settingDetailCopy}><Text style={styles.settingTitle}>播放方式</Text><Text style={styles.settingBody}>点按曲目后立即开始播放。</Text></View></View>
    </SettingsDetail>;
  }
  if (section === 'library') {
    return <SettingsDetail title="本地音乐" description="管理当前会话中导入的音频文件。" onBack={onBack}>
      <View style={styles.settingDetailRow}><View style={styles.settingDetailCopy}><Text style={styles.settingTitle}>当前音乐数量</Text><Text style={styles.settingBody}>{songCount} 首本地音乐</Text></View></View>
      <Text style={styles.settingsNote}>导入的文件仅在当前运行期间可用，关闭应用后不会自动保留。</Text>
      <Pressable style={styles.outlineButton} onPress={onClearLibrary} accessibilityRole="button"><Text style={styles.outlineButtonText}>清空当前歌库</Text></Pressable>
    </SettingsDetail>;
  }
  if (section === 'privacy') {
    return <SettingsDetail title="隐私与安全" description="Linmo Player 默认在本地处理音乐和应用数据。" onBack={onBack}>
      <Text style={styles.settingsNote}>当前版本不会上传本地音乐文件，也不会连接第三方音源。</Text>
      <View style={styles.settingDetailRow}><View style={styles.settingDetailCopy}><Text style={styles.settingTitle}>新手引导</Text><Text style={styles.settingBody}>重新查看首次使用说明。</Text></View><Pressable style={styles.smallOutlineButton} onPress={onResetOnboarding}><Text style={styles.outlineButtonText}>重新查看</Text></Pressable></View>
    </SettingsDetail>;
  }
  const items: readonly [SettingsSection, string, string][] = [
    ['playback', '播放设置', '音质和播放方式'],
    ['library', '本地音乐', '导入文件与音乐库'],
    ['privacy', '隐私与安全', '本地数据和插件权限'],
  ];
  return (
    <View>
      <Text style={styles.sectionTitle}>应用设置</Text>
      <View style={styles.settingsCard}>
        {items.map(([id, title, body], index) => (
          <Pressable key={id} style={[styles.settingRow, index < items.length - 1 && styles.settingRowBorder]} onPress={() => onSelect(id)} accessibilityRole="button">
            <View><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingBody}>{body}</Text></View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.versionCard}><Text style={styles.versionLabel}>LINMO PLAYER</Text><Text style={styles.versionText}>版本 0.1.0</Text></View>
    </View>
  );
}

function SettingsDetail({ title, description, onBack, children }: { title: string; description: string; onBack: () => void; children: ReactNode }) {
  return <View style={styles.settingsDetail}><Pressable onPress={onBack} accessibilityRole="button"><Text style={styles.settingsBack}>‹ 返回应用设置</Text></Pressable><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.settingsDescription}>{description}</Text><View style={styles.settingsDetailCard}>{children}</View></View>;
}

function SectionHeader({ title, action }: { title: string; action: string }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionAction}>{action}</Text></View>;
}

function SongRow({ song, index, active, onPress }: { song: UnifiedSong; index: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.songRow, pressed && styles.songRowPressed]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${song.title}，${song.artist}`}>
      <CoverTile index={index} size={52} />
      <View style={styles.songInfo}><Text style={[styles.songTitle, active && styles.songTitleActive]} numberOfLines={1}>{song.title}</Text><Text style={styles.songArtist} numberOfLines={1}>{song.artist}{song.album ? ` · ${song.album}` : ''}</Text></View>
      <Text style={styles.songMore}>{active ? '♫' : '•••'}</Text>
    </Pressable>
  );
}

function CoverTile({ index, size }: { index: number; size: number }) {
  const coverColors = [colors.primaryContainer, colors.tertiaryContainer, '#D7E8D1', '#F9DEDC'] as const;
  const glyphs = ['✦', '◒', '∿', '◌'] as const;
  const backgroundColor = coverColors[index % coverColors.length]!;
  const glyph = glyphs[index % glyphs.length]!;
  return <View style={[styles.coverTile, { width: size, height: size, backgroundColor }]}><Text style={styles.coverGlyph}>{glyph}</Text></View>;
}

function Chip({ label, selected = false }: { label: string; selected?: boolean }) {
  return <View style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></View>;
}

function MiniPlayer({ song, isPlaying, onToggle }: { song: LocalSong | null; isPlaying: boolean; onToggle: () => void }) {
  if (!song) return <View style={styles.miniPlayer}><Text style={styles.miniEmpty}>还没有正在播放的歌曲</Text></View>;
  return <View style={styles.miniPlayer}><CoverTile index={0} size={44} /><View style={styles.miniInfo}><Text style={styles.miniTitle} numberOfLines={1}>{song.title}</Text><Text style={styles.miniArtist} numberOfLines={1}>{song.artist}</Text></View><Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={isPlaying ? '暂停' : '播放'} style={styles.miniButton}><Text style={styles.miniButtonText}>{isPlaying ? 'Ⅱ' : '▶'}</Text></Pressable><Text style={styles.miniNext}>»</Text></View>;
}

const onboardingSlides = [
  { icon: '♫', eyebrow: '1 / 3', title: '导入本地音乐', body: '请选择设备中的 MP3、M4A 或 WAV 音频文件。', action: '导入音乐' },
  { icon: '▶', eyebrow: '2 / 3', title: '播放与控制', body: '选择任意曲目即可播放，可通过底部播放器进行暂停与继续。', action: '下一步' },
  { icon: '◈', eyebrow: '3 / 3', title: '插件扩展', body: '后续可通过插件接入外部音源，当前版本仅支持本地音乐。', action: '开始使用' },
] as const;

function OnboardingOverlay({ step, opacity, onImport, onNext, onFinish }: { step: number; opacity: Animated.Value; onImport: () => void; onNext: () => void; onFinish: () => void }) {
  const slide = onboardingSlides[step] ?? onboardingSlides[0];
  const isLast = step === onboardingSlides.length - 1;
  const handlePrimary = () => {
    if (isLast) onFinish();
    else {
      if (step === 0) onImport();
      onNext();
    }
  };
  return <Animated.View style={[styles.onboardingOverlay, { opacity }]}><View style={styles.onboardingCard}><View style={styles.onboardingIcon}><Text style={styles.onboardingIconText}>{slide.icon}</Text></View><Text style={styles.onboardingEyebrow}>{slide.eyebrow}</Text><Text style={styles.onboardingTitle}>{slide.title}</Text><Text style={styles.onboardingBody}>{slide.body}</Text><View style={styles.onboardingDots}>{onboardingSlides.map((_, index) => <View key={index} style={[styles.onboardingDot, index === step && styles.onboardingDotActive]} />)}</View><Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]} accessibilityRole="button" onPress={handlePrimary}><Text style={styles.primaryButtonText}>{slide.action}</Text><Text style={styles.primaryButtonIcon}>→</Text></Pressable>{!isLast && <Pressable style={styles.skipButton} onPress={onFinish}><Text style={styles.skipButtonText}>跳过引导</Text></Pressable>}</View></Animated.View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  appShell: { flex: 1 },
  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
  appTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '600', maxWidth: 280 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.secondaryContainer, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.onSecondaryContainer, fontSize: 19, fontWeight: '700' },
  profileMenu: { position: 'absolute', top: 62, right: spacing.lg, zIndex: 14, width: 230, padding: spacing.md, borderRadius: radii.card, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, elevation: 8 },
  profileMenuEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  profileMenuTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '700', marginTop: spacing.sm },
  profileMenuSubtitle: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 4 },
  profileMenuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant, marginVertical: spacing.md },
  profileMenuRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  profileMenuLabel: { color: colors.onSurfaceVariant, fontSize: 12 },
  profileMenuValue: { color: colors.onSurface, fontSize: 12, fontWeight: '700' },
  profileMenuNote: { color: colors.onSurfaceVariant, fontSize: 11, lineHeight: 17, padding: spacing.sm, marginTop: spacing.sm, borderRadius: radii.control, backgroundColor: 'rgba(103,80,164,0.08)' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  heroCard: { minHeight: 220, borderRadius: radii.card, backgroundColor: colors.primaryContainer, padding: spacing.lg, overflow: 'hidden', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  heroCopy: { flex: 1, zIndex: 1 },
  heroKicker: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: spacing.sm },
  heroTitle: { color: colors.onPrimaryContainer, fontSize: 26, lineHeight: 31, fontWeight: '700', maxWidth: 220 },
  heroBody: { color: colors.onPrimaryContainer, opacity: 0.72, marginTop: spacing.sm, fontSize: 14 },
  heroOrb: { position: 'absolute', right: -38, bottom: -35, width: 190, height: 190, borderRadius: 95, backgroundColor: '#D0BCFF', alignItems: 'center', justifyContent: 'center' },
  heroOrbInner: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.primary, opacity: 0.75 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radii.control, minHeight: 48, paddingHorizontal: spacing.md, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 138 },
  primaryButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  primaryButtonIcon: { color: colors.onPrimary, fontSize: 13, fontWeight: '800', marginLeft: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { color: colors.onSurface, fontSize: 21, fontWeight: '700' },
  sectionAction: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  sectionHint: { color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 20, marginTop: -2, marginBottom: spacing.lg },
  songList: { marginBottom: spacing.xl },
  songRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
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
  playlistTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '700', marginTop: spacing.sm },
  playlistCount: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 4 },
  libraryHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.md },
  libraryCount: { color: colors.onSurfaceVariant, fontSize: 13 },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { borderColor: colors.outline, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.secondaryContainer, borderColor: colors.secondaryContainer },
  chipText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: colors.onSecondaryContainer },
  libraryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 72 },
  libraryEmpty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: spacing.lg, backgroundColor: colors.surfaceContainer, borderRadius: radii.card },
  libraryEmptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '700' },
  libraryEmptyBody: { color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm, maxWidth: 280 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.secondaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  emptyIconText: { fontSize: 31, color: colors.primary },
  emptyTitle: { color: colors.onSurface, fontSize: 23, fontWeight: '700', textAlign: 'center' },
  emptyBody: { color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: spacing.sm, maxWidth: 300 },
  outlineButton: { borderColor: colors.outline, borderWidth: 1, borderRadius: radii.control, minHeight: 48, paddingHorizontal: spacing.lg, justifyContent: 'center', marginTop: spacing.lg },
  outlineButtonText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  caption: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: spacing.lg },
  settingsCard: { backgroundColor: colors.surfaceContainer, borderRadius: radii.card, paddingHorizontal: spacing.md, marginTop: spacing.md },
  settingRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingRowBorder: { borderBottomColor: colors.outlineVariant, borderBottomWidth: StyleSheet.hairlineWidth },
  settingTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  settingBody: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 4 },
  chevron: { color: colors.onSurfaceVariant, fontSize: 25 },
  settingsDetail: { flex: 1 },
  settingsBack: { color: colors.primary, fontSize: 13, fontWeight: '700', marginBottom: spacing.lg },
  settingsDescription: { color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 20, marginTop: spacing.sm, marginBottom: spacing.lg },
  settingsDetailCard: { backgroundColor: colors.surfaceContainer, borderRadius: radii.card, paddingHorizontal: spacing.md },
  settingDetailRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  settingDetailCopy: { flex: 1 },
  settingsNote: { color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 20, padding: spacing.md, borderRadius: radii.control, backgroundColor: 'rgba(103,80,164,0.08)', marginTop: spacing.md },
  smallOutlineButton: { borderColor: colors.outline, borderWidth: 1, borderRadius: radii.control, minHeight: 40, paddingHorizontal: spacing.md, justifyContent: 'center' },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.outlineVariant, padding: 3, justifyContent: 'center' },
  toggleActive: { backgroundColor: colors.primary },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 2, elevation: 2 },
  toggleThumbActive: { transform: [{ translateX: 18 }] },
  versionCard: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surfaceContainerHigh },
  versionLabel: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  versionText: { color: colors.onSurfaceVariant, marginTop: 8, fontSize: 13 },
  miniPlayer: { marginHorizontal: spacing.md, marginBottom: spacing.sm, minHeight: 64, padding: spacing.sm, paddingRight: spacing.md, borderRadius: radii.control, backgroundColor: colors.surfaceContainerHigh, flexDirection: 'row', alignItems: 'center' },
  miniInfo: { flex: 1, marginHorizontal: spacing.sm },
  miniTitle: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },
  miniArtist: { color: colors.onSurfaceVariant, fontSize: 11, marginTop: 3 },
  miniButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  miniButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  miniNext: { color: colors.onSurfaceVariant, fontSize: 25, marginLeft: spacing.sm },
  miniEmpty: { color: colors.onSurfaceVariant, fontSize: 12, flex: 1, textAlign: 'center' },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  onboardingOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(29, 27, 32, 0.42)', justifyContent: 'flex-end', zIndex: 20 },
  onboardingCard: { backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, alignItems: 'center' },
  onboardingIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  onboardingIconText: { color: colors.primary, fontSize: 30, fontWeight: '700' },
  onboardingEyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  onboardingTitle: { color: colors.onSurface, fontSize: 25, lineHeight: 31, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm },
  onboardingBody: { color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: spacing.sm, maxWidth: 330 },
  onboardingDots: { flexDirection: 'row', gap: 7, marginTop: spacing.lg, marginBottom: spacing.sm },
  onboardingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.outlineVariant },
  onboardingDotActive: { width: 22, backgroundColor: colors.primary },
  skipButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  skipButtonText: { color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' },
  bottomNav: { minHeight: 76, backgroundColor: colors.surfaceContainer, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8 },
  navItem: { minWidth: 64, minHeight: 60, alignItems: 'center' },
  navIcon: { minWidth: 56, minHeight: 32, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  navIconSelected: { backgroundColor: colors.secondaryContainer },
  navIconText: { color: colors.onSurfaceVariant, fontSize: 21 },
  navIconTextSelected: { color: colors.onSecondaryContainer },
  navLabel: { color: colors.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  navLabelSelected: { color: colors.onSurface, fontWeight: '700' },
});
