import { Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { Home } from './pages/Home'
import { NewRun } from './pages/NewRun'
import { PipelineProgress } from './pages/PipelineProgress'
import { OutputFolder } from './pages/OutputFolder'
import { History } from './pages/History'
import { RunDetail } from './pages/RunDetail'
import { Settings } from './pages/Settings'
import { Orgs } from './pages/Orgs'

export function App(): JSX.Element {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewRun />} />
        <Route path="/pipeline/:jobId" element={<PipelineProgress />} />
        <Route path="/imports/:importId" element={<OutputFolder />} />
        <Route path="/orgs" element={<Orgs />} />
        <Route path="/history" element={<History />} />
        <Route path="/runs/:runId" element={<RunDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Shell>
  )
}
