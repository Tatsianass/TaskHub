import { HStack, Image, Link, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  opacity,
  padding,
  shapes,
  strikethrough,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

export type TodayWidgetRow = { id: string; title: string; time: string; color: string; done: boolean };

export type TodayWidgetProps = {
  heading: string;
  progress: string;
  empty: string;
  rows: TodayWidgetRow[];
};

// Widget bodies run in an isolated runtime: no hooks, no module-scope constants, only swift-ui views.
const TodayWidget = (props: TodayWidgetProps) => {
  'widget';
  return (
    <VStack
      spacing={6}
      modifiers={[
        padding({ all: 2 }),
        containerBackground(
          { type: 'linearGradient', colors: ['#2A2150', '#14121F'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
          'widget',
        ),
        widgetURL('todomobile://'),
      ]}>
      <HStack>
        <Text modifiers={[font({ size: 18, weight: 'bold' }), foregroundStyle('#F4F2FA')]}>{props.heading}</Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle('#B9B4C7'), padding({ leading: 6 })]}>{props.progress}</Text>
        <Spacer />
        <Link destination="todomobile://?add=1">
          <ZStack
            modifiers={[
              frame({ width: 30, height: 30 }),
              background('#8F6BE8', shapes.circle()),
            ]}>
            <Image systemName="plus" size={14} color="#FFFFFF" />
          </ZStack>
        </Link>
      </HStack>
      {props.rows.length === 0 ? (
        <Text modifiers={[font({ size: 15 }), foregroundStyle('#B9B4C7')]}>{props.empty}</Text>
      ) : (
        props.rows.map((row) => (
          <HStack key={row.id} spacing={10}>
            <Image
              systemName={row.done ? 'checkmark.circle.fill' : 'circle'}
              size={20}
              color={row.done ? '#2FB8B0' : '#C9C4D8'}
            />
            <Text
              modifiers={[
                font({ size: 15 }),
                foregroundStyle('#F4F2FA'),
                lineLimit(1),
                opacity(row.done ? 0.55 : 1),
                strikethrough({ isActive: row.done, pattern: 'solid' }),
              ]}>
              {row.title}
            </Text>
            <Spacer />
            <Image systemName="circle.fill" size={8} color={row.color} />
            <Text modifiers={[font({ size: 12 }), foregroundStyle('#B9B4C7'), frame({ width: 40 })]}>{row.time}</Text>
          </HStack>
        ))
      )}
      <Spacer />
    </VStack>
  );
};

export default createWidget('TaskHubToday', TodayWidget);
