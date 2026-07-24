declare global {
  namespace JSX {
    namespace IntrinsicElements {
      interface ViewProps {
        className?: string;
      }
      interface TextProps {
        className?: string;
      }
      interface ScrollViewProps {
        className?: string;
      }
      interface TouchableOpacityProps {
        className?: string;
      }
      interface FlatListProps<ItemT> {
        className?: string;
      }
      interface ImageProps {
        className?: string;
      }
      interface TextInputProps {
        className?: string;
      }
      interface SafeAreaViewProps {
        className?: string;
      }
      interface PressableProps {
        className?: string;
      }
    }
  }
}

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
  }
  interface FlatListProps<ItemT> {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface SafeAreaViewProps {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
}

export {};
