import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import type { DerivedClinical, AffectedSide } from '../../data/types';

interface Props {
  derived: DerivedClinical;
  affectedSide: AffectedSide | null; // null = no consta
}

export function AnatomyModel({ derived, affectedSide }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="relative">
      <div className="h-80 rounded-lg overflow-hidden bg-clay-surface-elevated">
        <Suspense fallback={<div className="flex items-center justify-center h-full text-clay-text-muted text-sm">Cargando modelo 3D...</div>}>
          <Canvas camera={{ position: [0, 0, 4], fov: 45 }} shadows>
            <ambientLight intensity={0.6} color="#F9EDD9" />
            <directionalLight position={[3, 5, 4]} intensity={0.8} color="#F9EDD9" castShadow />
            <directionalLight position={[-2, 3, -2]} intensity={0.3} color="#EAEAF5" />

            <ArmModel
              derived={derived}
              affectedSide={affectedSide}
              onHover={setHovered}
            />

            <OrbitControls
              enablePan={false}
              enableZoom={true}
              minDistance={2.5}
              maxDistance={6}
              autoRotate={false}
            />
            <Environment preset="studio" />
          </Canvas>
        </Suspense>
      </div>

      {/* Tooltip overlay */}
      {hovered && (
        <div className="absolute top-3 right-3 bg-clay-surface-solid rounded-sm shadow-clay px-3 py-2 text-xs pointer-events-none">
          <div className="font-bold text-clay-text mb-1">{getRegionLabel(hovered)}</div>
          <div className="tabular-nums">
            {hovered === 'shoulder' && `Agarre proximal: ${derived.proximalGripScore.toFixed(1)}`}
            {hovered === 'forearm' && `Prono-supinación: ${derived.pronoSupScore.toFixed(1)}`}
            {hovered === 'hand' && `Flex-ext distal: ${derived.distalFlexExtScore.toFixed(1)}`}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-clay-text-muted">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-ok inline-block" /> &gt;70</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-warning inline-block" /> 40-70</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-alert inline-block" /> &lt;40</span>
        <span className="text-clay-text-muted ml-2">Lado afecto: {affectedSide ? (affectedSide === 'left' ? 'Izq' : 'Der') : 'No consta'}</span>
      </div>
    </div>
  );
}

function getRegionLabel(region: string): string {
  switch (region) {
    case 'shoulder': return 'Brazo superior (Agarre proximal)';
    case 'forearm': return 'Antebrazo (Prono-supinación)';
    case 'hand': return 'Mano (Flex-ext distal)';
    default: return region;
  }
}

function scoreToColor(score: number): string {
  if (score >= 70) return '#3F774D';
  if (score >= 40) return '#B27923';
  return '#AF3D36';
}

function ArmModel({ derived, affectedSide, onHover }: { derived: DerivedClinical; affectedSide: AffectedSide | null; onHover: (region: string | null) => void }) {
  const mirror = affectedSide === 'left' ? -1 : 1;

  const clayMaterial = (score: number) => ({
    color: scoreToColor(score),
    roughness: 0.9,
    metalness: 0,
  });

  return (
    <group position={[mirror * 0.3, 0, 0]}>
      {/* Torso reference (neutral) */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
        <meshStandardMaterial color="#C4C0BA" roughness={0.9} metalness={0} />
      </mesh>

      {/* Upper arm / shoulder - proximal grip */}
      <mesh
        position={[mirror * 0.7, 0.5, 0]}
        rotation={[0, 0, mirror * -0.3]}
        castShadow
        onPointerEnter={() => onHover('shoulder')}
        onPointerLeave={() => onHover(null)}
      >
        <capsuleGeometry args={[0.15, 0.6, 8, 16]} />
        <meshStandardMaterial {...clayMaterial(derived.proximalGripScore)} />
      </mesh>

      {/* Forearm - prono-supination */}
      <mesh
        position={[mirror * 1.1, -0.1, 0.1]}
        rotation={[0.2, 0, mirror * -0.6]}
        castShadow
        onPointerEnter={() => onHover('forearm')}
        onPointerLeave={() => onHover(null)}
      >
        <capsuleGeometry args={[0.12, 0.55, 8, 16]} />
        <meshStandardMaterial {...clayMaterial(derived.pronoSupScore)} />
      </mesh>

      {/* Hand - distal flex-ext */}
      <mesh
        position={[mirror * 1.4, -0.55, 0.2]}
        castShadow
        onPointerEnter={() => onHover('hand')}
        onPointerLeave={() => onHover(null)}
      >
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial {...clayMaterial(derived.distalFlexExtScore)} />
      </mesh>

      {/* Fingers - part of distal */}
      {[0, 1, 2, 3].map(i => (
        <mesh
          key={i}
          position={[mirror * (1.5 + i * 0.04), -0.7 - i * 0.02, 0.15 + (i - 1.5) * 0.06]}
          castShadow
        >
          <capsuleGeometry args={[0.03, 0.12, 4, 8]} />
          <meshStandardMaterial {...clayMaterial(derived.distalFlexExtScore)} />
        </mesh>
      ))}

      {/* Thumb */}
      <mesh position={[mirror * 1.25, -0.6, 0.35]} rotation={[0.5, 0, mirror * 0.4]} castShadow>
        <capsuleGeometry args={[0.04, 0.1, 4, 8]} />
        <meshStandardMaterial {...clayMaterial(derived.proximalGripScore)} />
      </mesh>

      {/* Non-affected side (dimmed) */}
      <mesh position={[mirror * -0.7, 0.5, 0]} rotation={[0, 0, mirror * 0.3]} castShadow>
        <capsuleGeometry args={[0.15, 0.6, 8, 16]} />
        <meshStandardMaterial color="#C4C0BA" roughness={0.9} metalness={0} opacity={0.5} transparent />
      </mesh>
      <mesh position={[mirror * -1.1, -0.1, 0.1]} rotation={[0.2, 0, mirror * 0.6]} castShadow>
        <capsuleGeometry args={[0.12, 0.55, 8, 16]} />
        <meshStandardMaterial color="#C4C0BA" roughness={0.9} metalness={0} opacity={0.5} transparent />
      </mesh>
      <mesh position={[mirror * -1.4, -0.55, 0.2]} castShadow>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#C4C0BA" roughness={0.9} metalness={0} opacity={0.5} transparent />
      </mesh>
    </group>
  );
}
