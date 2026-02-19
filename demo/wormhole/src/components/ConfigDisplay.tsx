import { useWormhole } from '@astroscope/wormhole/react';
import { configWormhole } from '../wormholes';

export default function ConfigDisplay() {
  const config = useWormhole(configWormhole);

  return (
    <div>
      <p>
        <strong>Site name:</strong> {config.siteName}
      </p>
      <div className="flex gap-2 mt-2">
        {config.features.map((feature) => (
          <span key={feature} className="badge badge-primary">
            {feature}
          </span>
        ))}
      </div>
    </div>
  );
}
