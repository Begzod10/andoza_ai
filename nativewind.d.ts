import 'nativewind';

declare module 'nativewind' {
  export interface NativeWindEnv {
    [key: string]: any;
  }
}

declare global {
  namespace React {
    interface ViewProps {
      className?: string;
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
  interface InputAccessoryViewProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface SafeAreaViewProps {
    className?: string;
  }
}

export {};
