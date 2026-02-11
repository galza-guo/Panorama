import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useTheme } from "./ThemeProvider";

const Particles = ({ color }: { color: string }) => {
  const mesh = useRef<THREE.Points>(null!);
  const count = 3000;

  const particlesPosition = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 20;
      const y = (Math.random() - 0.5) * 20;
      const z = (Math.random() - 0.5) * 20;
      positions.set([x, y, z], i * 3);
    }
    return positions;
  }, [count]);

  useFrame((state) => {
    const { clock } = state;
    const time = clock.getElapsedTime();

    // Rotate the entire system slowly for a floating effect
    if (mesh.current) {
      mesh.current.rotation.y = time * 0.05;
      mesh.current.rotation.x = time * 0.02;
    }
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particlesPosition.length / 3}
          array={particlesPosition}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color={color}
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

export default function Background() {
  const { theme } = useTheme();

  // Simple check for dark mode (assuming system defaults to dark if preference matches, or based on class)
  // Since we are using a class-based strategy, we can check the document class or just rely on the theme state.
  // However, 'system' theme resolution happens in ThemeProvider.
  // We can assume 'dark' if theme is 'dark' or users prefers dark when 'system'.
  // Ideally ThemeProvider should expose the *resolved* theme.
  // For now, let's implement a small helper or just duplicate logic slightly or check DOM.
  // Checking DOM is safest for class-based theming.

  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  // React state might not update on class change unless we listen to it or use the context.
  // The context 'theme' value is the *preference* (light, dark, system).
  // If 'system', we need to check media query.

  const effectiveTheme = useMemo(() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme;
  }, [theme]);

  const isDarkMode = effectiveTheme === "dark";

  // Colors
  const particleColor = isDarkMode ? "#5eead4" : "#3b82f6"; // Teal for dark, Blue for light
  const fogColor = isDarkMode ? "#000000" : "#ffffff";
  const bgColor = isDarkMode ? "bg-black" : "bg-white"; // Using tailwind classes for the div background

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-0 transition-colors duration-300 ${bgColor}`}
    >
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }} gl={{ alpha: true }}>
        <fog attach="fog" args={[fogColor, 5, 20]} />
        <ambientLight intensity={0.5} />
        <Particles color={particleColor} />
      </Canvas>
    </div>
  );
}
