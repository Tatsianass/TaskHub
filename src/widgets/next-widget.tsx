import { Gauge, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  padding,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

export type NextWidgetProps = {
  label: string;
  title: string;
  due: string;
  color: string;
  done: number;
  total: number;
};

const NextWidget = (props: NextWidgetProps) => {
  'widget';
  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[
        padding({ all: 2 }),
        containerBackground(
          { type: 'linearGradient', colors: ['#2A2150', '#14121F'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
          'widget',
        ),
        widgetURL('todomobile://'),
      ]}>
      <HStack spacing={6}>
        <Image systemName="circle.fill" size={8} color={props.color} />
        <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#B9B4C7')]}>{props.label}</Text>
        <Spacer />
      </HStack>
      <Text
        modifiers={[
          font({ size: 18, weight: 'bold' }),
          foregroundStyle('#F4F2FA'),
          lineLimit(3),
          minimumScaleFactor(0.8),
        ]}>
        {props.title}
      </Text>
      <Spacer />
      <HStack>
        <Text modifiers={[font({ size: 13 }), foregroundStyle('#B9B4C7')]}>{props.due}</Text>
        <Spacer />
        <Gauge value={props.done} min={0} max={Math.max(props.total, 1)} modifiers={[gaugeStyle('circularCapacity'), tint('#B69CFF')]}>
          <Text>{`${props.done}/${props.total}`}</Text>
        </Gauge>
      </HStack>
    </VStack>
  );
};

export default createWidget('TaskHubNext', NextWidget);
