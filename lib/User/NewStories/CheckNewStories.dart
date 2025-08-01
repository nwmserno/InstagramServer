import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';
import '../Service/NotificationService.dart';
import '../Service/NotificationSetting.dart';

class CheckNewStories extends StatefulWidget {
  const CheckNewStories({super.key});

  @override
  State<CheckNewStories> createState() => _CheckNewStoriesState();
}

class _CheckNewStoriesState extends State<CheckNewStories> {
  final TextEditingController _emailController = TextEditingController();
  final List<TextEditingController> usernameControllers = [
    TextEditingController(),
  ];

  List<String> recentEmails = [];
  List<String> recentUsernames = [];
  List<Map<String, dynamic>?> resultsPerField = [null];
  bool isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadRecentData();

    print('🚀 CheckNewStories initState เริ่มต้น');

    // เริ่มต้น Notification Service
    NotificationService().startNotificationService();

    print('✅ CheckNewStories initState เสร็จสิ้น');
  }

  // ตรวจสอบการเปลี่ยนแปลงสตอรี่สำหรับการแจ้งเตือน
  Future<void> _checkStoriesChanges(
      String username, Map<String, dynamic> result) async {
    print('🔍 ตรวจสอบการเปลี่ยนแปลงสตอรี่สำหรับ @$username');
    print(
        '📊 ข้อมูลปัจจุบัน: story_count=${result['story_count']}, new_story_count=${result['new_story_count']}');

    final prefs = await SharedPreferences.getInstance();
    final lastStoriesJson = prefs.getString('last_stories_$username');
    bool hasNewStories = false;
    String changeMessage = '';

    final currentStoryCount = result['story_count'] ?? 0;
    final currentNewStoryCount = result['new_story_count'] ?? 0;
    final currentFullName = result['full_name'] ?? username;

    int? lastStoryCount;
    int? lastNewStoryCount;

    if (lastStoriesJson != null) {
      final lastStories = jsonDecode(lastStoriesJson);
      lastStoryCount = lastStories['story_count'] ?? 0;
      lastNewStoryCount = lastStories['new_story_count'] ?? 0;
      print(
          '📊 ข้อมูลเก่า: story_count=$lastStoryCount, new_story_count=$lastNewStoryCount');

      // ตรวจสอบสตอรี่ใหม่
      if (currentNewStoryCount > lastNewStoryCount) {
        hasNewStories = true;
        final newStoriesCount = currentNewStoryCount - lastNewStoryCount;
        changeMessage += '• สตอรี่ใหม่: $newStoriesCount รายการ\n';
        print('🆕 พบสตอรี่ใหม่: $newStoriesCount รายการ');
      }

      // ตรวจสอบการเปลี่ยนแปลงจำนวนสตอรี่ทั้งหมด
      if (currentStoryCount != lastStoryCount) {
        hasNewStories = true;
        changeMessage += '• จำนวนสตอรี่ทั้งหมด: $currentStoryCount รายการ\n';
        print(
            '📈 จำนวนสตอรี่เปลี่ยนแปลง: $lastStoryCount → $currentStoryCount');
      }
    } else {
      print('🆕 ครั้งแรกที่ตรวจสอบ @$username');
      // ครั้งแรก - ถ้ามีสตอรี่ให้แจ้งเตือน
      if (currentStoryCount > 0) {
        hasNewStories = true;
        changeMessage += '• จำนวนสตอรี่ทั้งหมด: $currentStoryCount รายการ\n';
        if (currentNewStoryCount > 0) {
          changeMessage += '• สตอรี่ใหม่: $currentNewStoryCount รายการ\n';
        }
        print('🆕 พบสตอรี่ครั้งแรก: $currentStoryCount รายการ');
      }
    }

    // บันทึกข้อมูลสตอรี่ปัจจุบัน
    await prefs.setString(
        'last_stories_$username',
        jsonEncode({
          'story_count': currentStoryCount,
          'new_story_count': currentNewStoryCount,
          'full_name': currentFullName,
          'timestamp': DateTime.now().toIso8601String(),
        }));

    // ส่งการแจ้งเตือนถ้ามีสตอรี่ใหม่
    if (hasNewStories) {
      print('🔔 สตอรี่ใหม่สำหรับ @$username:\n$changeMessage');

      // ส่งการแจ้งเตือนอีเมลสำหรับการเปลี่ยนแปลง
      try {
        final settings =
            await NotificationService().loadNotificationSettings('stories');
        print('📧 การตั้งค่าการแจ้งเตือน: $settings');

        if (settings != null && settings['email'] != null) {
          final email = settings['email'] as String;
          print('📧 อีเมลสำหรับส่งการแจ้งเตือน: $email');

          // ส่งการแจ้งเตือนการเปลี่ยนแปลง
          final response = await http.post(
            Uri.parse('https://instagramserver-8562.onrender.com'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'usernames': [username],
              'email': email,
              'notification': true,
              'changes': changeMessage,
            }),
          );

          print('📡 Response status: ${response.statusCode}');
          print('📡 Response body: ${response.body}');

          if (response.statusCode == 200) {
            print(
                '📧 ส่งการแจ้งเตือนการเปลี่ยนแปลงสตอรี่สำหรับ @$username สำเร็จ');
          } else {
            print('❌ ส่งการแจ้งเตือนไม่สำเร็จ: ${response.statusCode}');
          }
        } else {
          print('❌ ไม่พบการตั้งค่าอีเมลสำหรับการแจ้งเตือน');
        }
      } catch (e) {
        print('❌ Error ส่งการแจ้งเตือนการเปลี่ยนแปลง: $e');
      }
    } else {
      print('ℹ️ ไม่พบการเปลี่ยนแปลงสตอรี่สำหรับ @$username');
    }
  }

  Future<void> _loadRecentData() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      recentEmails = prefs.getStringList('recent_story_emails') ?? [];
      recentUsernames = prefs.getStringList('recent_story_usernames') ?? [];
    });
  }

  Future<void> _saveRecentData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('recent_story_emails', recentEmails);
    await prefs.setStringList('recent_story_usernames', recentUsernames);
  }

  void _addUsernameField() {
    setState(() {
      usernameControllers.add(TextEditingController());
      resultsPerField.add(null);
    });
  }

  void _removeUsernameField(int index) {
    if (usernameControllers.length > 1) {
      setState(() {
        usernameControllers.removeAt(index);
        resultsPerField.removeAt(index);
      });
    }
  }

  Future<void> _checkStoriesForField(int fieldIndex,
      {bool isNotification = false}) async {
    final username = usernameControllers[fieldIndex].text.trim();
    if (username.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('กรุณากรอก username'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      final response = await http
          .post(
            Uri.parse('https://instagramserver-8562.onrender.com'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'usernames': [username],
              'email': _emailController.text.trim(),
              'notification': isNotification,
            }),
          )
          .timeout(const Duration(seconds: 30));

      if (response.statusCode == 200) {
        try {
          final data = jsonDecode(response.body);
          if (data['results'] != null && data['results'].isNotEmpty) {
            final result = data['results'][0];

            setState(() {
              resultsPerField[fieldIndex] = result;
            });

            // บันทึกประวัติเมื่อตรวจสอบเสร็จแล้ว
            if (!recentUsernames.contains(username)) {
              recentUsernames.insert(0, username);
              if (recentUsernames.length > 20) recentUsernames.removeLast();
            }

            // บันทึกอีเมลเมื่อตรวจสอบเสร็จแล้ว
            final email = _emailController.text.trim();
            if (email.isNotEmpty && !recentEmails.contains(email)) {
              recentEmails.insert(0, email);
              if (recentEmails.length > 10) recentEmails.removeLast();
            }

            await _saveRecentData();

            // แสดงผลลัพธ์ผ่าน SnackBar แทน popup
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content:
                    Text('ตรวจสอบเสร็จสิ้น: ${result['message'] ?? 'สำเร็จ'}'),
                backgroundColor: Colors.green,
                duration: const Duration(seconds: 3),
              ),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('ไม่พบข้อมูลผลลัพธ์'),
                backgroundColor: Colors.orange,
              ),
            );
          }
        } catch (jsonError) {
          // ถ้า response ไม่ใช่ JSON (เช่น HTML error page)
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  'API ส่งข้อมูลผิดรูปแบบ: ${response.body.substring(0, 100)}...'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } else {
        try {
          final errorData = jsonDecode(response.body);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(errorData['error'] ?? 'เกิดข้อผิดพลาด'),
              backgroundColor: Colors.red,
            ),
          );
        } catch (jsonError) {
          // ถ้า error response ไม่ใช่ JSON
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  'เกิดข้อผิดพลาด HTTP ${response.statusCode}: ${response.body.substring(0, 100)}...'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('เกิดข้อผิดพลาด: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        isLoading = false;
      });
    }
  }

  Future<void> _checkAllStories({bool isNotification = false}) async {
    final usernames = usernameControllers
        .map((controller) => controller.text.trim())
        .where((text) => text.isNotEmpty)
        .cast<String>()
        .toList();

    if (usernames.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('กรุณากรอก username อย่างน้อย 1 รายการ'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() {
      isLoading = true;
    });

    try {
      final response = await http
          .post(
            Uri.parse('https://instagramserver-8562.onrender.com'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'usernames': usernames,
              'email': _emailController.text.trim(),
              'notification': isNotification,
            }),
          )
          .timeout(const Duration(seconds: 60));

      if (response.statusCode == 200) {
        try {
          final data = jsonDecode(response.body);
          if (data['results'] != null) {
            // อัปเดตผลลัพธ์สำหรับแต่ละช่อง
            for (int i = 0; i < usernameControllers.length; i++) {
              final username = usernameControllers[i].text.trim();
              if (username.isNotEmpty) {
                final result = data['results'].firstWhere(
                  (r) => r['username'] == username,
                  orElse: () => {'error': 'ไม่พบข้อมูล'},
                );
                setState(() {
                  resultsPerField[i] = result;
                });
              }
            }

            // บันทึกประวัติเมื่อตรวจสอบเสร็จแล้ว
            for (final username in usernames) {
              if (!recentUsernames.contains(username)) {
                recentUsernames.insert(0, username);
              }
            }
            if (recentUsernames.length > 20) {
              recentUsernames.removeRange(20, recentUsernames.length);
            }

            // บันทึกอีเมลเมื่อตรวจสอบเสร็จแล้ว
            final email = _emailController.text.trim();
            if (email.isNotEmpty && !recentEmails.contains(email)) {
              recentEmails.insert(0, email);
              if (recentEmails.length > 10) recentEmails.removeLast();
            }

            await _saveRecentData();

            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('ตรวจสอบสตอรี่เสร็จสิ้น'),
                backgroundColor: Colors.green,
              ),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('ไม่พบข้อมูลผลลัพธ์'),
                backgroundColor: Colors.orange,
              ),
            );
          }
        } catch (jsonError) {
          // ถ้า response ไม่ใช่ JSON (เช่น HTML error page)
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  'API ส่งข้อมูลผิดรูปแบบ: ${response.body.substring(0, 100)}...'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } else {
        try {
          final errorData = jsonDecode(response.body);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(errorData['error'] ?? 'เกิดข้อผิดพลาด'),
              backgroundColor: Colors.red,
            ),
          );
        } catch (jsonError) {
          // ถ้า error response ไม่ใช่ JSON
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  'เกิดข้อผิดพลาด HTTP ${response.statusCode}: ${response.body.substring(0, 100)}...'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('เกิดข้อผิดพลาด: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ตรวจสอบสตอรี่ใหม่'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // อีเมล
            Card(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.email, color: Colors.deepPurple),
                            const SizedBox(width: 8),
                            Expanded(
                              child: const Text(
                                'อีเมลสำหรับรับการแจ้งเตือน',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            if (recentEmails.isNotEmpty)
                              PopupMenuButton<String>(
                                tooltip: 'เลือกจากประวัติ',
                                itemBuilder: (context) => recentEmails
                                    .map((email) => PopupMenuItem<String>(
                                          value: email,
                                          child: Row(
                                            mainAxisAlignment:
                                                MainAxisAlignment.spaceBetween,
                                            children: [
                                              Expanded(
                                                  child: Text(email,
                                                      overflow: TextOverflow
                                                          .ellipsis)),
                                              IconButton(
                                                icon: const Icon(Icons.delete,
                                                    color: Colors.red,
                                                    size: 20),
                                                tooltip: 'ลบอีเมลนี้',
                                                onPressed: () async {
                                                  setState(() {
                                                    recentEmails.remove(email);
                                                  });
                                                  await _saveRecentData();
                                                  Navigator.of(context).pop();
                                                },
                                              ),
                                            ],
                                          ),
                                        ))
                                    .toList(),
                                onSelected: (selected) {
                                  setState(() {
                                    _emailController.text = selected;
                                  });
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: Colors.deepPurple.shade50,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: const Icon(Icons.arrow_drop_down,
                                      size: 20),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _emailController,
                      decoration: InputDecoration(
                        hintText: 'กรอกอีเมล...',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        prefixIcon: const Icon(Icons.email_outlined),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 16),
                      ),
                      onChanged: (value) {
                        // ไม่บันทึกทุกครั้งที่พิมพ์
                      },
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 20),

            // ปุ่มจัดการข้อมูล
            if (recentUsernames.isNotEmpty)
              Card(
                elevation: 4,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.settings, color: Colors.deepPurple),
                          SizedBox(width: 8),
                          Text(
                            'จัดการข้อมูล',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          TextButton(
                            onPressed: () async {
                              final confirm = await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: const Text('ยืนยันการลบ'),
                                  content: const Text(
                                      'คุณต้องการลบทั้งหมดจริงหรือไม่?'),
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
                                final prefs =
                                    await SharedPreferences.getInstance();
                                await prefs.remove('recent_story_usernames');
                                await prefs.remove('recent_story_emails');
                                setState(() {
                                  recentUsernames.clear();
                                  recentEmails.clear();
                                  _emailController.clear();
                                  for (final controller
                                      in usernameControllers) {
                                    controller.clear();
                                  }
                                });
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content:
                                            Text('ลบทั้งหมดเรียบร้อยแล้ว')),
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
                                // ล้างช่องกรอกที่มีอยู่
                                for (final controller in usernameControllers) {
                                  controller.clear();
                                }

                                // เพิ่มช่องกรอกใหม่ตามจำนวน username ในประวัติ
                                while (usernameControllers.length <
                                    recentUsernames.length) {
                                  usernameControllers
                                      .add(TextEditingController());
                                  resultsPerField.add(null);
                                }

                                // วาง username ลงในช่องกรอก
                                for (int i = 0;
                                    i < recentUsernames.length;
                                    i++) {
                                  usernameControllers[i].text =
                                      recentUsernames[i];
                                }
                              });
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                      content: Text(
                                          'เพิ่มช่องกรอกและวางข้อความเรียบร้อยแล้ว')),
                                );
                              }
                            },
                            child: const Text('วางข้อความทั้งหมด'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

            const SizedBox(height: 20),

            // Username fields
            Card(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.person, color: Colors.deepPurple),
                            const SizedBox(width: 8),
                            Expanded(
                              child: const Text(
                                'Instagram Username',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            IconButton(
                              onPressed: _addUsernameField,
                              icon: const Icon(Icons.add_circle,
                                  color: Colors.green),
                              tooltip: 'เพิ่มช่องกรอก username',
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    ...List.generate(usernameControllers.length, (i) {
                      final usedUsernames = usernameControllers
                          .asMap()
                          .entries
                          .where((e) => e.key != i)
                          .map((e) => e.value.text.trim())
                          .toSet();

                      final availableUsernames = recentUsernames
                          .where((u) => !usedUsernames.contains(u))
                          .toList();

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: usernameControllers[i],
                                    decoration: InputDecoration(
                                      hintText: 'กรอก username...',
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      prefixIcon:
                                          const Icon(Icons.person_outline),
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                              horizontal: 16, vertical: 16),
                                    ),
                                    onChanged: (value) {
                                      // ไม่บันทึกทุกครั้งที่พิมพ์
                                    },
                                  ),
                                ),
                                const SizedBox(width: 8),
                                if (availableUsernames.isNotEmpty)
                                  PopupMenuButton<String>(
                                    tooltip: 'เลือกจากประวัติ',
                                    itemBuilder: (context) => availableUsernames
                                        .map((u) => PopupMenuItem<String>(
                                              value: u,
                                              child: Row(
                                                mainAxisAlignment:
                                                    MainAxisAlignment
                                                        .spaceBetween,
                                                children: [
                                                  Expanded(
                                                      child: Text(u,
                                                          overflow: TextOverflow
                                                              .ellipsis)),
                                                  IconButton(
                                                    icon: const Icon(
                                                        Icons.delete,
                                                        color: Colors.red,
                                                        size: 20),
                                                    tooltip: 'ลบ username นี้',
                                                    onPressed: () async {
                                                      setState(() {
                                                        recentUsernames
                                                            .remove(u);
                                                      });
                                                      await _saveRecentData();
                                                      Navigator.of(context)
                                                          .pop();
                                                    },
                                                  ),
                                                ],
                                              ),
                                            ))
                                        .toList(),
                                    onSelected: (selected) {
                                      setState(() {
                                        usernameControllers[i].text = selected;
                                      });
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 8, vertical: 6),
                                      decoration: BoxDecoration(
                                        color: Colors.deepPurple.shade50,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: const Icon(Icons.arrow_drop_down,
                                          size: 20),
                                    ),
                                  ),
                                const SizedBox(width: 8),
                                if (usernameControllers.length > 1)
                                  SizedBox(
                                    width: 40,
                                    height: 40,
                                    child: IconButton(
                                      onPressed: () => _removeUsernameField(i),
                                      icon: const Icon(Icons.remove_circle,
                                          color: Colors.red, size: 20),
                                      tooltip: 'ลบช่องนี้',
                                      style: IconButton.styleFrom(
                                        padding: EdgeInsets.zero,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: ElevatedButton.icon(
                                    onPressed: isLoading
                                        ? null
                                        : () => _checkStoriesForField(i),
                                    icon: const Icon(Icons.search),
                                    label: Text('ตรวจสอบ (ช่องที่ ${i + 1})'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.blue,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 12),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    }),

                    const SizedBox(height: 16),

                    // ปุ่มตรวจสอบทั้งหมด
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: isLoading ? null : _checkAllStories,
                        icon: isLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.search),
                        label: Text(isLoading
                            ? 'กำลังตรวจสอบ...'
                            : 'ตรวจสอบสตอรี่ทั้งหมด'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.deepPurple,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 20),

            // ผลลัพธ์
            ...List.generate(usernameControllers.length, (i) {
              final result = resultsPerField[i];
              if (result == null) return const SizedBox.shrink();

              return Card(
                elevation: 2,
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            result['error'] != null
                                ? Icons.error
                                : Icons.check_circle,
                            color: result['error'] != null
                                ? Colors.red
                                : Colors.green,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '@${usernameControllers[i].text.trim()}',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (result['error'] != null)
                        Text(
                          'ข้อผิดพลาด: ${result['error']}',
                          style: const TextStyle(color: Colors.red),
                        )
                      else ...[
                        Text('ชื่อ: ${result['full_name'] ?? 'ไม่ระบุ'}'),
                        Text('สถานะ: ${result['message'] ?? 'ไม่ระบุ'}'),
                        Text(
                            'จำนวนสตอรี่ทั้งหมด: ${result['story_count'] ?? 0} รายการ'),
                        if (result['new_story_count'] != null &&
                            result['new_story_count'] > 0) ...[
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.green.shade100,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: Colors.green.shade300),
                            ),
                            child: Text(
                              'สตอรี่ใหม่: ${result['new_story_count']} รายการ',
                              style: TextStyle(
                                color: Colors.green.shade800,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ],
                  ),
                ),
              );
            }),

            // การตั้งค่าการแจ้งเตือน
            if (_emailController.text.trim().isNotEmpty &&
                usernameControllers.any((c) => c.text.trim().isNotEmpty))
              NotificationSetting(
                type: 'stories',
                title: 'การแจ้งเตือนสตอรี่ใหม่',
                usernames: usernameControllers
                    .map((c) => c.text.trim())
                    .where((e) => e.isNotEmpty)
                    .cast<String>()
                    .toList(),
                email: _emailController.text.trim(),
              ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    for (final controller in usernameControllers) {
      controller.dispose();
    }
    super.dispose();
  }
}
