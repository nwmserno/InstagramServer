import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:intl/intl.dart';
import 'package:video_player/video_player.dart';
import 'package:shared_preferences/shared_preferences.dart';

class StoriesServer extends StatefulWidget {
  const StoriesServer({super.key});

  @override
  State<StoriesServer> createState() => _StoriesServerState();
}

class _StoriesServerState extends State<StoriesServer> {
  List<TextEditingController> controllers = [TextEditingController()];
  List<Map<String, dynamic>?> profiles = [null];
  List<List<dynamic>> storiesList = [[]];
  List<bool> loadings = [false];
  List<String?> errors = [null];
  List<String> recentUsernames = [];
  List<Map<String, dynamic>> bulkResults = [];
  bool bulkLoading = false;
  String? bulkError;

  @override
  void initState() {
    super.initState();
    loadUsernames();
  }

  Future<void> saveUsername(String username) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> usernames = prefs.getStringList('recent_usernames') ?? [];
    if (username.isNotEmpty) {
      usernames.remove(username);
      usernames.insert(0, username);
      if (usernames.length > 10) usernames = usernames.sublist(0, 10);
      await prefs.setStringList('recent_usernames', usernames);
      setState(() {
        recentUsernames = usernames;
      });
    }
  }

  Future<void> loadUsernames() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      recentUsernames = prefs.getStringList('recent_usernames') ?? [];
    });
  }

  Future<void> fetchStories(int idx) async {
    final username = controllers[idx].text.trim();
    await saveUsername(username);
    setState(() {
      loadings[idx] = true;
      profiles[idx] = null;
      storiesList[idx] = [];
      errors[idx] = null;
    });
    final response = await http.post(
      Uri.parse('https://instagramserver-8562.onrender.com'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username}),
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      setState(() {
        profiles[idx] = data['profile'];
        storiesList[idx] = data['stories'];
      });
    } else {
      setState(() {
        errors[idx] = 'ไม่พบผู้ใช้หรือบัญชีเป็น private';
      });
    }
    setState(() {
      loadings[idx] = false;
    });
  }

  Future<void> fetchStoriesBulk(List<String> usernames) async {
    for (final u in usernames) {
      await saveUsername(u);
    }
    setState(() {
      bulkLoading = true;
      bulkResults = [];
      bulkError = null;
    });
    final response = await http.post(
      Uri.parse('https://instagramserver-8562.onrender.com'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'usernames': usernames}),
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      setState(() {
        bulkResults = List<Map<String, dynamic>>.from(data['results']);
      });
    } else {
      setState(() {
        bulkError = 'Bulk fetch failed.';
      });
    }
    setState(() {
      bulkLoading = false;
    });
  }

  String formatTime(String iso) {
    final dt = DateTime.parse(iso).toLocal();
    return DateFormat('dd MMM yyyy HH:mm').format(dt);
  }

  bool isValidHttpUrl(String? url) {
    return url != null &&
        (url.startsWith('http://') || url.startsWith('https://'));
  }

  Widget buildStoryWidget(Map<String, dynamic> story) {
    if (story['type'] == 'photo' && isValidHttpUrl(story['url'])) {
      return GestureDetector(
        onTap: () {
          showDialog(
            context: context,
            builder: (context) => Dialog(
              backgroundColor: Colors.black,
              insetPadding: EdgeInsets.zero,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final maxH = constraints.maxHeight * 0.9;
                  final maxW = constraints.maxWidth * 0.95;
                  return Center(
                    child: Container(
                      constraints: BoxConstraints(
                        maxHeight: maxH,
                        maxWidth: maxW,
                      ),
                      child: Stack(
                        children: [
                          SingleChildScrollView(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                InteractiveViewer(
                                  child: Image.network(story['url'],
                                      fit: BoxFit.contain),
                                ),
                              ],
                            ),
                          ),
                          Positioned(
                            top: 8,
                            right: 8,
                            child: IconButton(
                              icon: const Icon(Icons.close,
                                  color: Colors.white, size: 32),
                              onPressed: () => Navigator.of(context).pop(),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          );
        },
        child: Image.network(story['url'], height: 200, fit: BoxFit.cover),
      );
    } else if (story['type'] == 'video' && isValidHttpUrl(story['url'])) {
      return GestureDetector(
        onTap: () {
          showDialog(
            context: context,
            builder: (context) => Dialog(
              backgroundColor: Colors.black,
              insetPadding: EdgeInsets.zero,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final maxH = constraints.maxHeight * 0.9;
                  final maxW = constraints.maxWidth * 0.95;
                  return Center(
                    child: Container(
                      constraints: BoxConstraints(
                        maxHeight: maxH,
                        maxWidth: maxW,
                      ),
                      child: Stack(
                        children: [
                          SingleChildScrollView(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                VideoStoryPlayer(
                                    url: story['url'], fullscreen: true),
                              ],
                            ),
                          ),
                          Positioned(
                            top: 8,
                            right: 8,
                            child: IconButton(
                              icon: const Icon(Icons.close,
                                  color: Colors.white, size: 32),
                              onPressed: () => Navigator.of(context).pop(),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          );
        },
        child: VideoStoryPlayer(url: story['url']),
      );
    } else if (story['type'] == 'photo') {
      return Container(
          height: 200,
          color: Colors.grey[200],
          child: const Icon(Icons.broken_image, size: 48));
    } else if (story['type'] == 'video') {
      return Container(
          height: 200,
          color: Colors.grey[200],
          child: const Icon(Icons.videocam, size: 48));
    }
    return const SizedBox.shrink();
  }

  void addField() {
    setState(() {
      controllers.add(TextEditingController());
      profiles.add(null);
      storiesList.add([]);
      loadings.add(false);
      errors.add(null);
    });
  }

  void removeField(int idx) {
    setState(() {
      controllers.removeAt(idx);
      profiles.removeAt(idx);
      storiesList.removeAt(idx);
      loadings.removeAt(idx);
      errors.removeAt(idx);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FA),
      appBar: AppBar(
        title: const Text('Download Instagram Stories'),
        backgroundColor: Colors.white,
        elevation: 0.5,
        foregroundColor: Colors.deepPurple,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (recentUsernames.isNotEmpty) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('ค้นหาล่าสุด:',
                      style: TextStyle(fontWeight: FontWeight.bold)),
                  Row(
                    children: [
                      TextButton(
                        onPressed: () async {
                          final confirm = await showDialog<bool>(
                            context: context,
                            builder: (context) => AlertDialog(
                              title: const Text('ยืนยันการลบ'),
                              content:
                                  const Text('คุณต้องการลบทั้งหมดจริงหรือไม่?'),
                              actions: [
                                TextButton(
                                  onPressed: () =>
                                      Navigator.of(context).pop(false),
                                  child: const Text('ยกเลิก'),
                                ),
                                TextButton(
                                  onPressed: () =>
                                      Navigator.of(context).pop(true),
                                  child: const Text('ลบ'),
                                ),
                              ],
                            ),
                          );
                          if (confirm == true) {
                            final prefs = await SharedPreferences.getInstance();
                            await prefs.remove('recent_usernames');
                            setState(() {
                              recentUsernames.clear();
                            });
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text('ลบทั้งหมดเรียบร้อยแล้ว')),
                              );
                            }
                          }
                        },
                        child: const Text('ลบทั้งหมด'),
                      ),
                      const SizedBox(width: 8),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            controllers = recentUsernames
                                .map((u) => TextEditingController(text: u))
                                .toList();
                            profiles = List<Map<String, dynamic>?>.filled(
                                recentUsernames.length, null,
                                growable: true);
                            storiesList = List<List<dynamic>>.filled(
                                recentUsernames.length, [],
                                growable: true);
                            loadings = List<bool>.filled(
                                recentUsernames.length, false,
                                growable: true);
                            errors = List<String?>.filled(
                                recentUsernames.length, null,
                                growable: true);
                          });
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content:
                                      Text('วางข้อความทั้งหมดเรียบร้อยแล้ว')),
                            );
                          }
                        },
                        child: const Text('วางข้อความทั้งหมด'),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
            ...controllers.asMap().entries.map((entry) {
              int i = entry.key;
              // ตรวจสอบ username ซ้ำ
              String currentUsername = controllers[i].text.trim();
              bool isDuplicate = controllers
                          .where((c) => c.text.trim() == currentUsername)
                          .length >
                      1 &&
                  currentUsername.isNotEmpty;
              return Column(
                children: [
                  Card(
                    elevation: 4,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                    margin: const EdgeInsets.symmetric(vertical: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              const Padding(
                                padding: EdgeInsets.only(right: 8),
                                child: Icon(
                                  Icons.camera_alt_rounded,
                                  color: Colors.deepPurple,
                                ),
                              ),
                              Expanded(
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: TextField(
                                        controller: controllers[i],
                                        decoration: InputDecoration(
                                          labelText: 'Instagram Username',
                                          filled: true,
                                          fillColor: const Color(0xFFF5F6FA),
                                          border: OutlineInputBorder(
                                            borderRadius:
                                                BorderRadius.circular(12),
                                            borderSide: BorderSide.none,
                                          ),
                                          suffixIcon: controllers.length > 1
                                              ? IconButton(
                                                  icon: const Icon(
                                                      Icons.remove_circle,
                                                      color: Colors.red),
                                                  onPressed: () {
                                                    removeField(i);
                                                  },
                                                )
                                              : null,
                                        ),
                                        style: const TextStyle(fontSize: 16),
                                        onChanged: (_) {
                                          setState(
                                              () {}); // เพื่อ refresh duplicate check
                                        },
                                      ),
                                    ),
                                    if (recentUsernames.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(left: 4),
                                        child: Builder(
                                          builder: (context) {
                                            // filter recentUsernames ไม่ให้แสดง username ที่ถูกใช้ในช่องอื่นแล้ว
                                            final usedUsernames = controllers
                                                .asMap()
                                                .entries
                                                .where((e) => e.key != i)
                                                .map((e) => e.value.text.trim())
                                                .toSet();
                                            final availableUsernames =
                                                recentUsernames
                                                    .where((u) => !usedUsernames
                                                        .contains(u))
                                                    .toList();
                                            if (availableUsernames.isEmpty)
                                              return const SizedBox.shrink();
                                            return PopupMenuButton<String>(
                                              tooltip: 'เลือกจากประวัติ',
                                              itemBuilder:
                                                  (context) =>
                                                      availableUsernames
                                                          .map(
                                                              (u) =>
                                                                  PopupMenuItem<
                                                                      String>(
                                                                    value: u,
                                                                    child: Row(
                                                                      mainAxisAlignment:
                                                                          MainAxisAlignment
                                                                              .spaceBetween,
                                                                      children: [
                                                                        Expanded(
                                                                            child:
                                                                                Text(u, overflow: TextOverflow.ellipsis)),
                                                                        IconButton(
                                                                          icon: const Icon(
                                                                              Icons.delete,
                                                                              color: Colors.red,
                                                                              size: 20),
                                                                          tooltip:
                                                                              'ลบ username นี้',
                                                                          onPressed:
                                                                              () async {
                                                                            final prefs =
                                                                                await SharedPreferences.getInstance();
                                                                            setState(() {
                                                                              recentUsernames.remove(u);
                                                                            });
                                                                            await prefs.setStringList('recent_usernames',
                                                                                recentUsernames);
                                                                            Navigator.of(context).pop();
                                                                          },
                                                                        ),
                                                                      ],
                                                                    ),
                                                                  ))
                                                          .toList(),
                                              onSelected: (selected) {
                                                setState(() {
                                                  controllers[i].text =
                                                      selected;
                                                });
                                              },
                                              child: Container(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 8,
                                                        vertical: 10),
                                                decoration: BoxDecoration(
                                                  color:
                                                      Colors.deepPurple.shade50,
                                                  borderRadius:
                                                      BorderRadius.circular(8),
                                                ),
                                                child: const Icon(
                                                    Icons.arrow_drop_down),
                                              ),
                                            );
                                          },
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          ElevatedButton.icon(
                            onPressed: loadings[i] || isDuplicate
                                ? null
                                : () {
                                    final username = controllers[i].text.trim();
                                    if (username.isNotEmpty) {
                                      fetchStories(i);
                                    }
                                  },
                            icon: const Icon(Icons.download_rounded),
                            label: loadings[i]
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: Colors.white))
                                : Text('Download! (ช่องที่ ${i + 1})'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.deepPurple,
                              foregroundColor: Colors.white,
                              textStyle: const TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.bold),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              elevation: 2,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                          ),
                          if (isDuplicate)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text('ห้ามกรอกซ้ำ',
                                  style: const TextStyle(color: Colors.red)),
                            ),
                          if (errors[i] != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(errors[i]!,
                                  style: const TextStyle(color: Colors.red)),
                            ),
                          if (profiles[i] != null && bulkResults.isEmpty) ...[
                            const Divider(height: 28),
                            Text('Current stories',
                                style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: 12),
                            CircleAvatar(
                              radius: 48,
                              backgroundImage: (profiles[i] != null &&
                                      isValidHttpUrl(
                                          profiles[i]!['profile_pic_url']))
                                  ? NetworkImage(
                                      profiles[i]!['profile_pic_url'])
                                  : null,
                              child: (profiles[i] == null ||
                                      !isValidHttpUrl(
                                          profiles[i]!['profile_pic_url']))
                                  ? const Icon(Icons.person,
                                      size: 48, color: Colors.deepPurple)
                                  : null,
                              backgroundColor: Colors.deepPurple.shade50,
                            ),
                            const SizedBox(height: 8),
                            Text(profiles[i]!['username'],
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 18)),
                            if (profiles[i]!['display_name'] != null)
                              Text(profiles[i]!['display_name'],
                                  style: const TextStyle(fontSize: 16)),
                            Text('${profiles[i]!['story_count']} stories'),
                            if (profiles[i]!['last_story_time'] != null)
                              Text(
                                  'last story added ${formatTime(profiles[i]!['last_story_time'])}'),
                            const SizedBox(height: 24),
                            Text(
                                '${profiles[i]!['username']} stories ${storiesList[i].length}/${profiles[i]!['story_count']}',
                                style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 12),
                            for (final story in storiesList[i]) ...[
                              buildStoryWidget(story),
                              const SizedBox(height: 8),
                              Text(
                                  'Type: ${story['type'].toString().toUpperCase()}'),
                              if (story['posted_at'] != null)
                                Text('added ${formatTime(story['posted_at'])}'),
                              const SizedBox(height: 24),
                            ],
                          ],
                        ],
                      ),
                    ),
                  ),
                  if (i < controllers.length - 1)
                    const Divider(
                        height: 24, thickness: 1, color: Color(0xFFE0E0E0)),
                ],
              );
            }),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: addField,
                icon: const Icon(Icons.add_circle, color: Colors.deepPurple),
                label: const Text('เพิ่มช่องกรอก',
                    style: TextStyle(
                        color: Colors.deepPurple, fontWeight: FontWeight.bold)),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.deepPurple,
                  textStyle: const TextStyle(fontSize: 16),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: bulkLoading
                        ? null
                        : () {
                            final usernames = controllers
                                .map((c) => c.text.trim())
                                .where((t) => t.isNotEmpty)
                                .cast<String>()
                                .toList();
                            if (usernames.isNotEmpty)
                              fetchStoriesBulk(usernames);
                          },
                    icon: const Icon(Icons.download_for_offline_rounded),
                    label: bulkLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Text('Download ทั้งหมด'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.deepPurple.shade100,
                      foregroundColor: Colors.deepPurple.shade700,
                      textStyle: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 18),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            if (bulkError != null)
              Text(bulkError!, style: const TextStyle(color: Colors.red)),
            if (bulkResults.isNotEmpty)
              ...bulkResults.map((result) => result['success'] == true
                  ? Card(
                      elevation: 3,
                      margin: const EdgeInsets.symmetric(vertical: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Divider(),
                            Text('User: ${result['profile']['username']}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 18)),
                            Text('${result['profile']['story_count']} stories'),
                            if (result['profile']['last_story_time'] != null)
                              Text(
                                  'last story added ${formatTime(result['profile']['last_story_time'])}'),
                            const SizedBox(height: 12),
                            ...List.generate(
                                result['stories'].length,
                                (i) => Column(
                                      children: [
                                        buildStoryWidget(result['stories'][i]),
                                        const SizedBox(height: 8),
                                        Text(
                                            'Type: ${result['stories'][i]['type'].toString().toUpperCase()}'),
                                        if (result['stories'][i]['posted_at'] !=
                                            null)
                                          Text(
                                              'added ${formatTime(result['stories'][i]['posted_at'])}'),
                                        const SizedBox(height: 24),
                                      ],
                                    )),
                          ],
                        ),
                      ),
                    )
                  : Card(
                      elevation: 3,
                      margin: const EdgeInsets.symmetric(vertical: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Divider(),
                            Text('User: ${result['username']}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 18)),
                            Text('Error: ${result['error']}',
                                style: const TextStyle(color: Colors.red)),
                            const SizedBox(height: 24),
                          ],
                        ),
                      ),
                    )),
          ],
        ),
      ),
    );
  }
}

class VideoStoryPlayer extends StatefulWidget {
  final String url;
  final bool fullscreen;
  const VideoStoryPlayer(
      {super.key, required this.url, this.fullscreen = false});

  @override
  State<VideoStoryPlayer> createState() => _VideoStoryPlayerState();
}

class _VideoStoryPlayerState extends State<VideoStoryPlayer> {
  late VideoPlayerController _controller;
  bool _isInit = false;
  String? _error;

  void _initVideo() {
    _controller = VideoPlayerController.network(widget.url)
      ..initialize().then((_) {
        if (mounted) {
          setState(() {
            _isInit = true;
          });
        }
      });
    // เพิ่ม timeout
    Future.delayed(const Duration(seconds: 15), () {
      if (!_isInit && mounted && _error == null) {
        setState(() {
          _error = 'Video load timeout';
        });
      }
    });
    _controller.addListener(() {
      if (_controller.value.hasError) {
        setState(() {
          _error = _controller.value.errorDescription;
        });
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _initVideo();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Container(
        height: 200,
        color: Colors.grey[200],
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Video error: $_error',
                  style: const TextStyle(color: Colors.red)),
              TextButton(
                onPressed: () {
                  setState(() {
                    _error = null;
                    _isInit = false;
                  });
                  _controller.dispose();
                  _initVideo();
                },
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }
    return _isInit
        ? Column(
            children: [
              widget.fullscreen
                  ? Center(
                      child: AspectRatio(
                        aspectRatio: _controller.value.aspectRatio,
                        child: VideoPlayer(_controller),
                      ),
                    )
                  : AspectRatio(
                      aspectRatio: _controller.value.aspectRatio,
                      child: VideoPlayer(_controller),
                    ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    icon: Icon(_controller.value.isPlaying
                        ? Icons.pause
                        : Icons.play_arrow),
                    onPressed: () {
                      setState(() {
                        _controller.value.isPlaying
                            ? _controller.pause()
                            : _controller.play();
                      });
                    },
                  ),
                ],
              ),
            ],
          )
        : Container(
            height: widget.fullscreen ? 300 : 200,
            color: Colors.grey[200],
            child: const Center(child: CircularProgressIndicator()));
  }
}

// Widget สำหรับ dropdown พร้อมปุ่มลบ
class _RecentUsernamesDropdown extends StatefulWidget {
  final List<String> recentUsernames;
  final void Function(String?) onSelect;
  final void Function(String) onDelete;
  const _RecentUsernamesDropdown({
    required this.recentUsernames,
    required this.onSelect,
    required this.onDelete,
  });
  @override
  State<_RecentUsernamesDropdown> createState() =>
      _RecentUsernamesDropdownState();
}

class _RecentUsernamesDropdownState extends State<_RecentUsernamesDropdown> {
  String? selected;
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: DropdownButton<String>(
            isExpanded: true,
            hint: const Text('เลือกจากที่เคยค้นหา'),
            value: selected,
            items: widget.recentUsernames.map((username) {
              return DropdownMenuItem<String>(
                value: username,
                child: Text(username),
              );
            }).toList(),
            onChanged: (value) {
              setState(() {
                selected = value;
              });
              widget.onSelect(value);
            },
          ),
        ),
        const SizedBox(width: 8),
        IconButton(
          icon: const Icon(Icons.delete, color: Colors.red),
          onPressed: selected == null
              ? null
              : () async {
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('ยืนยันการลบ'),
                      content:
                          Text('คุณต้องการลบ "' + selected! + '" หรือไม่?'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.of(context).pop(false),
                          child: const Text('ยกเลิก'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.of(context).pop(true),
                          child: const Text('ลบ'),
                        ),
                      ],
                    ),
                  );
                  if (confirm == true) {
                    widget.onDelete(selected!);
                    setState(() {
                      selected = null;
                    });
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('ลบชื่อผู้ใช้นี้เรียบร้อยแล้ว')),
                      );
                    }
                  }
                },
          tooltip: 'ลบ username ที่เลือก',
        ),
      ],
    );
  }
}
