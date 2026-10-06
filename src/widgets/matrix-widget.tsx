import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  shapes,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

export type MatrixWidgetCell = { label: string; count: number; color: string };

export type MatrixWidgetProps = { cells: MatrixWidgetCell[] };

const MatrixWidget = (props: MatrixWidgetProps) => {
  'widget';
  const cells = props.cells;
  return (
    <VStack
      spacing={6}
      modifiers={[
        containerBackground(
          { type: 'linearGradient', colors: ['#2A2150', '#14121F'], startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } },
          'widget',
        ),
        widgetURL('todomobile://'),
      ]}>
      {[0, 2].map((start) => (
        <HStack key={start} spacing={6}>
          {cells.slice(start, start + 2).map((cell) => (
            <VStack
              key={cell.label}
              alignment="leading"
              modifiers={[
                padding({ all: 8 }),
                frame({ maxWidth: 1000, maxHeight: 1000, alignment: 'topLeading' }),
                background(cell.color, shapes.roundedRectangle({ cornerRadius: 14 })),
              ]}>
              <Text modifiers={[font({ size: 26, weight: 'heavy' }), foregroundStyle('#FFFFFF')]}>{String(cell.count)}</Text>
              <Spacer />
              <Text
                modifiers={[
                  font({ size: 11, weight: 'semibold' }),
                  foregroundStyle('#FFFFFF'),
                  lineLimit(2),
                  minimumScaleFactor(0.8),
                ]}>
                {cell.label}
              </Text>
            </VStack>
          ))}
        </HStack>
      ))}
    </VStack>
  );
};

export default createWidget('TaskHubMatrix', MatrixWidget);
