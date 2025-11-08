# SplatNav - Gaussian Splat Navigation Mesh Generator

A Vite web application that enables users to upload Gaussian splat files (.spz, .ply, .splat), visualize them in 3D using Babylon.js, convert point clouds to meshes, and generate Recast/Detour navigation meshes with configurable parameters.

## ⚠️ CRITICAL: Development Rules

**BEFORE ANY WORK: Read the rules files!**

All developers and AI assistants MUST read the following files before creating plans or implementing code:

1. **`.cursor/rules/plan.mdc`** - Planning phase rules
2. **`.cursor/rules/create.mdc`** - Implementation phase rules
3. **`.cursorrules`** - Project root rules file
4. **`.cursor/rules/CHECKLIST.md`** - Quick reference checklist

### Quick Rules Summary

- ❌ **NO `any` types** in TypeScript
- ❌ **NO type casts** (`as Type`, `<Type>value`)
- ❌ **NO console logging** (`console.log`, `console.error`, `console.warn`)
- ❌ **NO timeouts** (`setTimeout`, `setInterval`)
- ✅ **GitHub operations** must use EricEisaman account

See `.cursor/rules/` directory for complete rules and `.cursor/rules/CHECKLIST.md` for a compliance checklist.

## Features

- **Multiple File Format Support**: Upload and parse `.spz`, `.ply`, and `.splat` Gaussian splat files
- **3D Visualization**: Interactive 3D viewer powered by Babylon.js to preview point clouds
- **Point Cloud to Mesh Conversion**: Convert point clouds to meshes using Delaunay triangulation
- **Navigation Mesh Generation**: Generate Recast/Detour format navigation meshes with customizable parameters
- **Configurable Parameters**: Adjust agent radius, max slope, walkable height, walkable climb, cell size, and cell height
- **Download Support**: Export generated navigation meshes in `.navmesh` format

## Tech Stack

- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Next-generation frontend build tool
- **Vuetify 3** - Material Design component framework
- **Babylon.js 8.36.1+** - 3D graphics engine with Gaussian Splatting support
- **Recast/Detour** - Navigation mesh generation

## Getting Started

### Prerequisites

- Node.js 24+ and npm
- Babylon.js 8.36.1 or later (required for SPZ file support)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Run the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build

Build for production:
```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

1. **Upload a File**: Click the file upload area and select a Gaussian splat file (.spz, .ply, or .splat)
2. **View Point Cloud**: The uploaded point cloud will be displayed in the 3D viewer
3. **Configure Parameters**: Adjust navigation mesh parameters using the sliders
4. **Generate Navigation Mesh**: Click "Generate Navigation Mesh" to convert the point cloud to a mesh and generate the navigation mesh
5. **Download**: Once generation is complete, click "Download Navigation Mesh" to save the `.navmesh` file

## Project Structure

```
splatnav/
├── src/
│   ├── components/       # Vue components
│   │   ├── FileUploader.vue
│   │   ├── Viewer3D.vue
│   │   ├── NavMeshParameters.vue
│   │   └── ProcessingStatus.vue
│   ├── utils/            # Utility functions
│   │   ├── splatParsers.ts
│   │   ├── meshConverter.ts
│   │   ├── navMeshGenerator.ts
│   │   └── fileDownload.ts
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   ├── plugins/          # Vue plugins
│   │   └── vuetify.ts
│   ├── styles/           # Global styles
│   │   └── main.css
│   ├── App.vue           # Main app component
│   └── main.ts           # Application entry point
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## License

MIT License - see LICENSE file for details