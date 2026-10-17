'use client';

import { motion, useMotionTemplate, useTransform, type MotionValue } from 'motion/react';

/**
 * Изометрическая комната на CSS 3D (без WebGL). Пол лежит в плоскости XY, «вверх» — ось Z.
 * Задние стены стоят по краям y = 0 и x = S, зритель смотрит со стороны угла (0, S), поэтому
 * у мебели видны три грани: верх, +Y и −X. Сборка идёт по progress (0…1) от прокрутки.
 * opacity задаётся только плоским элементам: на контейнере с preserve-3d она «сплющивает» 3D.
 */

const S = 300;
const H = 150;

type Faces = { top: string; front: string; side: string };

type BoxProps = {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** Высота основания над полом. */
  z?: number;
  faces: Faces;
  progress: MotionValue<number>;
  /** Отрезок прогресса, на котором предмет опускается на место. */
  at: [number, number];
  radius?: number;
};

function Box({ x, y, w, d, h, z = 0, faces, progress, at, radius = 3 }: BoxProps) {
  const drop = useTransform(progress, at, [z + 170, z], { clamp: true });
  const opacity = useTransform(progress, [at[0], at[0] + (at[1] - at[0]) * 0.35], [0, 1]);
  return (
    <motion.div
      className="preserve-3d absolute"
      style={{ left: x, top: y, width: w, height: d, translateZ: drop }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          opacity,
          background: faces.top,
          borderRadius: radius,
          transform: `translateZ(${h}px)`,
        }}
      />
      <motion.div
        className="absolute left-0"
        style={{
          opacity,
          top: d,
          width: w,
          height: h,
          background: faces.front,
          borderRadius: `0 0 ${radius}px ${radius}px`,
          transformOrigin: 'top',
          transform: 'rotateX(90deg)',
        }}
      />
      <motion.div
        className="absolute top-0"
        style={{
          opacity,
          left: -h,
          width: h,
          height: d,
          background: faces.side,
          transformOrigin: 'right',
          transform: 'rotateY(90deg)',
        }}
      />
    </motion.div>
  );
}

/** Мягкая тень предмета на полу (градиент вместо filter: blur, чтобы не нагружать отрисовку). */
function FloorShadow({
  x,
  y,
  w,
  d,
  progress,
  at,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  progress: MotionValue<number>;
  at: [number, number];
}) {
  const opacity = useTransform(progress, at, [0, 1]);
  return (
    <motion.div
      className="absolute"
      style={{
        left: x - 10,
        top: y - 4,
        width: w + 26,
        height: d + 22,
        opacity,
        background:
          'radial-gradient(closest-side, rgb(64 44 24 / 0.28), rgb(64 44 24 / 0.1) 60%, transparent)',
        transform: 'translateZ(0.5px)',
      }}
    />
  );
}

/** Контуры мебели на чертеже: x, y, ширина, глубина. */
const FOOTPRINTS: [number, number, number, number][] = [
  [40, 8, 160, 66],
  [104, 130, 76, 54],
  [254, 214, 44, 80],
  [218, 8, 36, 36],
];

const OAK: Faces = { top: '#d9b98f', front: '#c49f72', side: '#ae8a5f' };
const WHITE: Faces = { top: '#fbfbfc', front: '#e8eaee', side: '#d6dae1' };
const TERRA: Faces = { top: '#d9663a', front: '#c2410c', side: '#a3360a' };
const TERRA_SOFT: Faces = { top: '#e27a50', front: '#cc5326', side: '#ad4318' };
const SAGE: Faces = { top: '#9db39a', front: '#86a083', side: '#6f8a6d' };
const INK: Faces = { top: '#3a4354', front: '#262e3c', side: '#1b2230' };
const SAND: Faces = { top: '#ece4d6', front: '#ddd2c0', side: '#cfc3ae' };

export function RoomScene({
  progress,
  tiltX,
  tiltY,
}: {
  progress: MotionValue<number>;
  tiltX: MotionValue<number>;
  tiltY: MotionValue<number>;
}) {
  // Камера: лёгкий доворот и наклон по ходу прокрутки плюс реакция на курсор.
  const baseRx = useTransform(progress, [0, 1], [58, 54]);
  const baseRz = useTransform(progress, [0, 1], [-47, -36]);
  const rx = useTransform(() => baseRx.get() + tiltY.get());
  const rz = useTransform(() => baseRz.get() + tiltX.get());
  const scale = useTransform(progress, [0, 0.3, 1], [0.9, 1, 1.04]);
  const transform = useMotionTemplate`rotateX(${rx}deg) rotateZ(${rz}deg) scale(${scale})`;

  // Чертёж → стены → отделка.
  const blueprint = useTransform(progress, [0.26, 0.4], [1, 0]);
  const wallA = useTransform(progress, [0.12, 0.3], [-8, -90], { clamp: true });
  const wallB = useTransform(progress, [0.16, 0.34], [-8, -90], { clamp: true });
  const wallOpacity = useTransform(progress, [0.1, 0.2], [0, 1]);
  const floor = useTransform(progress, [0.2, 0.38], [0, 1]);
  const ghost = useTransform(progress, [0.18, 0.32], [1, 0]);
  const glow = useTransform(progress, [0.82, 1], [0, 1]);
  const windowLight = useTransform(progress, [0.7, 0.95], [0.25, 1]);

  return (
    <div className="room-stage relative grid size-full place-items-center">
      <motion.div
        className="preserve-3d relative"
        style={{ width: S, height: S, transform, marginTop: 70 }}
      >
        {/* Пол: сетка чертежа поверх дерева */}
        <motion.div
          className="room-floor absolute inset-0 rounded-[3px]"
          style={{ opacity: floor }}
        />
        <motion.div className="room-blueprint absolute inset-0" style={{ opacity: blueprint }}>
          {FOOTPRINTS.map(([x, y, w, d]) => (
            <span
              key={`${x}-${y}`}
              className="absolute rounded-[2px] border border-dashed border-[#25406e]/45 bg-[#25406e]/[0.04]"
              style={{ left: x, top: y, width: w, height: d }}
            />
          ))}
          <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums tracking-wide text-[#25406e]">
            6,0 м
          </span>
          <span className="absolute -left-9 top-1/2 -translate-y-1/2 -rotate-90 text-[11px] font-semibold tabular-nums tracking-wide text-[#25406e]">
            6,0 м
          </span>
        </motion.div>

        {/* Контуры будущих стен на этапе чертежа */}
        <motion.div
          className="room-ghost absolute left-0"
          style={{
            top: -H,
            width: S,
            height: H,
            opacity: ghost,
            transformOrigin: 'bottom',
            transform: 'rotateX(-90deg)',
          }}
        />
        <motion.div
          className="room-ghost absolute top-0"
          style={{
            left: S,
            width: H,
            height: S,
            opacity: ghost,
            transformOrigin: 'left',
            transform: 'rotateY(-90deg)',
          }}
        />

        {/* Стена вдоль y = 0: поднимается из плоскости пола */}
        <motion.div
          className="absolute left-0"
          style={{
            top: -H,
            width: S,
            height: H,
            opacity: wallOpacity,
            rotateX: wallA,
            transformOrigin: 'bottom',
            background: 'linear-gradient(180deg, #e6e8ec, #d9dce2)',
          }}
        >
          {/* Картина */}
          <div
            className="absolute rounded-[2px]"
            style={{
              left: 70,
              top: 22,
              width: 92,
              height: 46,
              background: 'linear-gradient(135deg, #f1d9c8, #d9663a 60%, #a3360a)',
              boxShadow: '0 0 0 4px #fbfbfc, 0 6px 14px -6px rgb(30 30 40 / 0.4)',
            }}
          />
          {/* Плинтус */}
          <div className="absolute inset-x-0 bottom-0 h-[6px] bg-[#dcdfe5]" />
        </motion.div>

        {/* Стена вдоль x = S, с окном */}
        <motion.div
          className="absolute top-0"
          style={{
            left: S,
            width: H,
            height: S,
            opacity: wallOpacity,
            rotateY: wallB,
            transformOrigin: 'left',
            background: 'linear-gradient(90deg, #d3d8df, #c6ccd5)',
          }}
        >
          <motion.div
            className="absolute rounded-[3px]"
            style={{
              left: 46,
              top: 70,
              width: 82,
              height: 120,
              opacity: windowLight,
              background:
                'linear-gradient(160deg, #ffffff, #e9f1fb 55%, #d6e4f5), linear-gradient(#fff, #fff)',
              boxShadow: 'inset 0 0 0 4px #f7f8fa, inset 0 0 0 6px #cfd5de',
            }}
          >
            <div className="absolute inset-y-[6px] left-1/2 w-[3px] -translate-x-1/2 bg-[#cfd5de]" />
          </motion.div>
          <div className="absolute inset-y-0 left-0 w-[6px] bg-[#cdd2da]" />
        </motion.div>

        {/* Свет из окна на полу */}
        <motion.div
          className="absolute"
          style={{
            left: 150,
            top: 60,
            width: 150,
            height: 150,
            opacity: glow,
            background: 'radial-gradient(closest-side, rgb(255 244 222 / 0.75), transparent)',
            transform: 'translateZ(0.6px)',
          }}
        />

        {/* Ковёр */}
        <Box
          x={56}
          y={104}
          w={170}
          d={130}
          h={2}
          faces={SAND}
          progress={progress}
          at={[0.56, 0.66]}
          radius={2}
        />

        {/* Диван у стены y = 0 */}
        <FloorShadow x={40} y={12} w={160} d={70} progress={progress} at={[0.62, 0.72]} />
        <Box x={40} y={8} w={160} d={22} h={66} faces={TERRA} progress={progress} at={[0.6, 0.7]} />
        <Box
          x={40}
          y={30}
          w={160}
          d={44}
          h={30}
          faces={TERRA_SOFT}
          progress={progress}
          at={[0.6, 0.7]}
        />
        <Box
          x={40}
          y={30}
          w={18}
          d={44}
          h={46}
          faces={TERRA}
          progress={progress}
          at={[0.62, 0.72]}
        />
        <Box
          x={182}
          y={30}
          w={18}
          d={44}
          h={46}
          faces={TERRA}
          progress={progress}
          at={[0.62, 0.72]}
        />

        {/* Журнальный столик */}
        <FloorShadow x={104} y={130} w={76} d={54} progress={progress} at={[0.66, 0.76]} />
        <Box
          x={104}
          y={130}
          w={76}
          d={54}
          h={24}
          faces={OAK}
          progress={progress}
          at={[0.64, 0.74]}
        />
        <Box
          x={120}
          y={142}
          w={18}
          d={18}
          h={14}
          z={24}
          faces={WHITE}
          progress={progress}
          at={[0.72, 0.8]}
        />

        {/* Шкаф у стены с окном */}
        <FloorShadow x={252} y={214} w={44} d={80} progress={progress} at={[0.68, 0.78]} />
        <Box
          x={254}
          y={214}
          w={44}
          d={80}
          h={92}
          faces={WHITE}
          progress={progress}
          at={[0.66, 0.76]}
        />
        <Box
          x={254}
          y={214}
          w={44}
          d={80}
          h={4}
          z={92}
          faces={OAK}
          progress={progress}
          at={[0.7, 0.8]}
        />

        {/* Растение в углу */}
        <Box x={222} y={12} w={28} d={28} h={26} faces={INK} progress={progress} at={[0.7, 0.8]} />
        <Box
          x={218}
          y={8}
          w={36}
          d={36}
          h={40}
          z={26}
          faces={SAGE}
          progress={progress}
          at={[0.74, 0.84]}
          radius={14}
        />

        {/* Торшер */}
        <Box
          x={16}
          y={98}
          w={6}
          d={6}
          h={110}
          faces={INK}
          progress={progress}
          at={[0.74, 0.84]}
          radius={1}
        />
        <Box
          x={6}
          y={88}
          w={26}
          d={26}
          h={22}
          z={104}
          faces={WHITE}
          progress={progress}
          at={[0.76, 0.86]}
          radius={4}
        />
      </motion.div>
    </div>
  );
}
