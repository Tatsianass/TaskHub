import { useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuroraBackground } from '@/components/aurora-background';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { QUADRANTS } from '@/constants/quadrants';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';
import { useOnboarding } from '@/context/onboarding-context';
import { useTheme } from '@/hooks/use-theme';
import { hexToRgba } from '@/utils/colors';

/** The slides show small copies of real screens, so what the user sees here is what they'll get. */
function MatrixPreview() {
  const { t } = useLocale();
  const theme = useTheme();

  return (
    <View style={styles.matrix}>
      {QUADRANTS.map((quadrant, index) => (
        <View
          key={quadrant.id}
          style={[
            styles.tile,
            { backgroundColor: hexToRgba(quadrant.color, 0.2), borderColor: hexToRgba(quadrant.color, 0.55) },
          ]}>
          <ThemedText type="smallBold" style={{ color: quadrant.color }}>
            {t(quadrant.shortLabelKey)}
          </ThemedText>
          <View style={styles.sampleTask}>
            <View style={[styles.checkbox, { borderColor: quadrant.color }]} />
            <ThemedText type="small" numberOfLines={2} style={styles.flex}>
              {t(`onboarding.matrix.task${index + 1}`)}
            </ThemedText>
          </View>
          <View style={[styles.sampleLine, { backgroundColor: theme.border }]} />
        </View>
      ))}
    </View>
  );
}

function SmartPreview() {
  const { t } = useLocale();
  const theme = useTheme();
  const urgent = QUADRANTS[0];

  return (
    <View style={[styles.card, { backgroundColor: theme.glassBgStrong, borderColor: theme.glassBorder }]}>
      <View style={styles.typing}>
        <ThemedText style={styles.flexShrink}>{t('onboarding.smart.sample')}</ThemedText>
        <View style={[styles.caret, { backgroundColor: theme.primary }]} />
      </View>
      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: hexToRgba(theme.primary, 0.16), borderColor: hexToRgba(theme.primary, 0.5) }]}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            {t('onboarding.smart.date')}
          </ThemedText>
        </View>
        <View style={[styles.chip, { backgroundColor: hexToRgba(urgent.color, 0.2), borderColor: hexToRgba(urgent.color, 0.6) }]}>
          <ThemedText type="small" style={{ color: urgent.color }}>
            {t(urgent.shortLabelKey)}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

function ReminderPreview() {
  const { t } = useLocale();
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.glassBgStrong, borderColor: theme.glassBorder }]}>
      <View style={styles.notifHeader}>
        <View style={[styles.appIcon, { backgroundColor: theme.primary }]} />
        <ThemedText type="small" themeColor="textSecondary">
          {t('app.brand')}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{t('onboarding.remind.notifTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('onboarding.remind.notifBody')}
      </ThemedText>
      <View style={[styles.notifActions, { borderTopColor: theme.border }]}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {t('notifications.actionDone')}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {t('notifications.actionPostpone')}
        </ThemedText>
      </View>
    </View>
  );
}

const SLIDES: { key: string; preview: () => ReactNode }[] = [
  { key: 'matrix', preview: () => <MatrixPreview /> },
  { key: 'smart', preview: () => <SmartPreview /> },
  { key: 'remind', preview: () => <ReminderPreview /> },
];

export default function OnboardingScreen() {
  const { t } = useLocale();
  const theme = useTheme();
  const { markSeen } = useOnboarding();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const isLast = page === SLIDES.length - 1;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const handleNext = () => {
    if (isLast) markSeen();
    else scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <AuroraBackground>
      <SafeAreaView style={styles.flex}>
        <View style={styles.skipRow}>
          {!isLast && (
            <Pressable onPress={markSeen} hitSlop={12}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('onboarding.skip')}
              </ThemedText>
            </Pressable>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={styles.flex}>
          {SLIDES.map((slide) => (
            <View key={slide.key} style={[styles.slide, { width }]}>
              <View style={styles.previewArea}>
                <View style={styles.preview}>{slide.preview()}</View>
              </View>
              <View style={styles.text}>
                <ThemedText type="subtitle">{t(`onboarding.${slide.key}.title`)}</ThemedText>
                <ThemedText themeColor="textSecondary">{t(`onboarding.${slide.key}.body`)}</ThemedText>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((slide, index) => (
              <View
                key={slide.key}
                style={[
                  styles.dot,
                  { backgroundColor: index === page ? theme.primary : theme.border },
                  index === page && styles.dotActive,
                ]}
              />
            ))}
          </View>
          <PrimaryButton title={isLast ? t('onboarding.start') : t('onboarding.next')} onPress={handleNext} />
        </View>
      </SafeAreaView>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  skipRow: {
    height: 40,
    paddingHorizontal: Spacing.four,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  slide: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  previewArea: {
    flex: 1,
    justifyContent: 'center',
  },
  preview: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  text: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    minHeight: 190,
  },
  matrix: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: '48.5%',
    aspectRatio: 1,
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sampleTask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  sampleLine: {
    height: 8,
    width: '60%',
    borderRadius: 4,
    marginLeft: 24,
  },
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  caret: {
    width: 2,
    height: 20,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  appIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
  },
  notifActions: {
    flexDirection: 'row',
    gap: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two + 4,
    marginTop: Spacing.one,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
  },
});
