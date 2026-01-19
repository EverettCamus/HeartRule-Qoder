#!/usr/bin/env node

/**
 * 版本切换工作区内容同步测试
 * 
 * 测试目标：验证版本切换后，工作区内容能够正确同步到目标版本的快照内容
 */

const API_BASE = 'http://localhost:8000/api';

async function request(method, url, body) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.error || 'Unknown error'}`);
  }

  return data;
}

async function testVersionSwitchSync() {
  console.log('🧪 开始测试版本切换工作区内容同步\n');

  let projectId;
  let fileId;
  let version1Id;
  let version2Id;

  try {
    // 1. 创建测试工程
    console.log('📝 步骤 1: 创建测试工程');
    const createResult = await request('POST', `${API_BASE}/projects`, {
      projectName: '版本切换测试工程',
      description: '用于测试版本切换后工作区内容同步',
      engineVersion: '1.2.0',
      engineVersionMin: '1.0.0',
      author: '测试工程师',
      tags: ['test', 'version-switch'],
    });
    projectId = createResult.data.id;
    console.log(`✅ 工程创建成功，ID: ${projectId}\n`);

    // 2. 获取工程文件
    console.log('📝 步骤 2: 获取工程文件列表');
    const filesResult = await request('GET', `${API_BASE}/projects/${projectId}/files`);
    const files = filesResult.data;
    console.log(`✅ 找到 ${files.length} 个文件`);
    
    // 找到一个 session 类型的文件
    const sessionFile = files.find(f => f.fileType === 'session');
    if (!sessionFile) {
      // 创建一个 session 文件
      const newFileResult = await request('POST', `${API_BASE}/projects/${projectId}/files`, {
        fileType: 'session',
        fileName: 'test-session.yaml',
        fileContent: {
          session: {
            session_id: 'test-session',
            session_name: 'Test Session',
            phases: [
              {
                phase_id: 'phase_1',
                phase_name: 'Phase 1',
                topics: []
              }
            ]
          }
        }
      });
      fileId = newFileResult.data.id;
      console.log(`✅ 创建新文件: ${newFileResult.data.fileName}\n`);
    } else {
      fileId = sessionFile.id;
      console.log(`✅ 使用现有文件: ${sessionFile.fileName}\n`);
    }

    // 3. 修改文件内容为版本1
    console.log('📝 步骤 3: 修改文件内容为版本1');
    const version1Content = {
      session: {
        session_id: 'test-session',
        session_name: 'Test Session V1',
        phases: [
          {
            phase_id: 'phase_1',
            phase_name: 'Phase 1 - Version 1',
            topics: [
              {
                topic_id: 'topic_1',
                topic_name: 'Topic 1',
                actions: []
              }
            ]
          }
        ]
      }
    };
    
    await request('PUT', `${API_BASE}/projects/${projectId}/files/${fileId}`, {
      fileContent: version1Content,
      yamlContent: 'session:\n  session_id: test-session\n  session_name: Test Session V1\n  phases:\n    - phase_id: phase_1\n      phase_name: Phase 1 - Version 1\n      topics:\n        - topic_id: topic_1\n          topic_name: Topic 1\n          actions: []\n'
    });
    console.log('✅ 文件内容已更新为版本1\n');

    // 4. 发布版本1
    console.log('📝 步骤 4: 发布版本1');
    const publish1Result = await request('POST', `${API_BASE}/projects/${projectId}/publish`, {
      versionNumber: 'v1.0.0',
      releaseNote: '版本1：包含Phase 1和Topic 1',
      publishedBy: '测试工程师',
    });
    version1Id = publish1Result.data.id;
    console.log(`✅ 版本1发布成功，ID: ${version1Id}\n`);

    // 5. 修改文件内容为版本2
    console.log('📝 步骤 5: 修改文件内容为版本2');
    const version2Content = {
      session: {
        session_id: 'test-session',
        session_name: 'Test Session V2',
        phases: [
          {
            phase_id: 'phase_1',
            phase_name: 'Phase 1 - Version 2',
            topics: [
              {
                topic_id: 'topic_1',
                topic_name: 'Topic 1',
                actions: []
              },
              {
                topic_id: 'topic_2',
                topic_name: 'Topic 2 - NEW',
                actions: []
              }
            ]
          },
          {
            phase_id: 'phase_2',
            phase_name: 'Phase 2 - NEW',
            topics: []
          }
        ]
      }
    };
    
    await request('PUT', `${API_BASE}/projects/${projectId}/files/${fileId}`, {
      fileContent: version2Content,
      yamlContent: 'session:\n  session_id: test-session\n  session_name: Test Session V2\n  phases:\n    - phase_id: phase_1\n      phase_name: Phase 1 - Version 2\n      topics:\n        - topic_id: topic_1\n          topic_name: Topic 1\n          actions: []\n        - topic_id: topic_2\n          topic_name: Topic 2 - NEW\n          actions: []\n    - phase_id: phase_2\n      phase_name: Phase 2 - NEW\n      topics: []\n'
    });
    console.log('✅ 文件内容已更新为版本2（增加了Phase 2和Topic 2）\n');

    // 6. 发布版本2
    console.log('📝 步骤 6: 发布版本2');
    const publish2Result = await request('POST', `${API_BASE}/projects/${projectId}/publish`, {
      versionNumber: 'v2.0.0',
      releaseNote: '版本2：增加了Phase 2和Topic 2',
      publishedBy: '测试工程师',
    });
    version2Id = publish2Result.data.id;
    console.log(`✅ 版本2发布成功，ID: ${version2Id}\n`);

    // 7. 验证当前工作区内容是版本2
    console.log('📝 步骤 7: 验证当前工作区内容是版本2');
    const currentFileResult = await request('GET', `${API_BASE}/projects/${projectId}/files/${fileId}`);
    const currentFile = currentFileResult.data;
    const currentPhases = currentFile.fileContent.session.phases;
    console.log(`✅ 当前工作区 phases 数量: ${currentPhases.length}`);
    console.log(`   Session Name: ${currentFile.fileContent.session.session_name}`);
    if (currentPhases.length === 2) {
      console.log('✅ 验证通过：工作区包含2个phases（版本2）\n');
    } else {
      throw new Error(`❌ 验证失败：期望2个phases，实际${currentPhases.length}个`);
    }

    // 8. 切换到版本1
    console.log('📝 步骤 8: 切换到版本1');
    await request('PUT', `${API_BASE}/projects/${projectId}/current-version`, {
      versionId: version1Id,
    });
    console.log('✅ 版本切换成功\n');

    // 9. 验证工作区内容已恢复为版本1
    console.log('📝 步骤 9: 验证工作区内容已恢复为版本1');
    const switchedFileResult = await request('GET', `${API_BASE}/projects/${projectId}/files/${fileId}`);
    const switchedFile = switchedFileResult.data;
    const switchedPhases = switchedFile.fileContent.session.phases;
    const switchedSessionName = switchedFile.fileContent.session.session_name;
    
    console.log(`✅ 切换后工作区 phases 数量: ${switchedPhases.length}`);
    console.log(`   Session Name: ${switchedSessionName}`);
    console.log(`   Phase 1 Name: ${switchedPhases[0].phase_name}`);
    console.log(`   Phase 1 Topics: ${switchedPhases[0].topics.length} 个`);

    if (switchedPhases.length === 1 && switchedSessionName === 'Test Session V1') {
      console.log('✅ 验证通过：工作区已恢复为版本1（1个phase，session_name为V1）\n');
    } else {
      throw new Error(`❌ 验证失败：期望1个phase和V1名称，实际${switchedPhases.length}个phase，名称${switchedSessionName}`);
    }

    // 10. 切换回版本2
    console.log('📝 步骤 10: 切换回版本2');
    await request('PUT', `${API_BASE}/projects/${projectId}/current-version`, {
      versionId: version2Id,
    });
    console.log('✅ 版本切换成功\n');

    // 11. 再次验证工作区内容已恢复为版本2
    console.log('📝 步骤 11: 验证工作区内容已恢复为版本2');
    const finalFileResult = await request('GET', `${API_BASE}/projects/${projectId}/files/${fileId}`);
    const finalFile = finalFileResult.data;
    const finalPhases = finalFile.fileContent.session.phases;
    const finalSessionName = finalFile.fileContent.session.session_name;
    
    console.log(`✅ 最终工作区 phases 数量: ${finalPhases.length}`);
    console.log(`   Session Name: ${finalSessionName}`);

    if (finalPhases.length === 2 && finalSessionName === 'Test Session V2') {
      console.log('✅ 验证通过：工作区已恢复为版本2（2个phases，session_name为V2）\n');
    } else {
      throw new Error(`❌ 验证失败：期望2个phases和V2名称，实际${finalPhases.length}个phases，名称${finalSessionName}`);
    }

    console.log('🎉 所有测试通过！版本切换工作区内容同步功能正常。');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  }
}

// 运行测试
testVersionSwitchSync().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
